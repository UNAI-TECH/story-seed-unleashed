import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { ThumbsUp, Eye, X, Share2, Play, Loader2, User, Phone, Search, ArrowLeft, Copy, Check, MessageCircle, Instagram, Facebook, Mail, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { supabase, getSafeImageUrl } from '@/integrations/supabase/client';


interface Contestant {
  id: string;
  first_name: string;
  last_name: string;
  story_title: string;
  story_description: string;
  age: number;
  category: string;
  class_level: string | null;
  yt_link: string | null;
  overall_votes: number;
  overall_views: number;
  photo: string;
  event_name?: string;
  city?: string;
  email?: string;
  phone?: string;
  created_at?: string;
}

const Voting = () => {
  const { eventId } = useParams<{ eventId?: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Google authentication states
  const [isVerified, setIsVerified] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState('');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  const [contestants, setContestants] = useState<Contestant[]>([]);
  const [judgeTop6Ids, setJudgeTop6Ids] = useState<Set<string>>(new Set());
  const [selectedContestant, setSelectedContestant] = useState<Contestant | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [voterName, setVoterName] = useState('');
  const [voterPhone, setVoterPhone] = useState('');
  const [loading, setLoading] = useState(true);
  const [voting, setVoting] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isShareModalOpen, setIsShareModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [canVoteStatus, setCanVoteStatus] = useState<{ canVote: boolean; reason?: string }>({ canVote: true });
  const [checkingVote, setCheckingVote] = useState(false);
  const [hasRecordedView, setHasRecordedView] = useState(false);
  const [votingOpen, setVotingOpen] = useState(false);
  const [lastFetchTime, setLastFetchTime] = useState<number>(0);

  // Store IDs of participants that should be shown (excluding judge top 6)
  const [eligibleForVotingIds, setEligibleForVotingIds] = useState<Set<string>>(new Set());

  // Check if user is already verified
  // Check if user is already verified via Google OAuth
  useEffect(() => {
    const checkVerification = async () => {
      setCheckingAuth(true);

      // Check localStorage first
      const storedVerified = localStorage.getItem('story_seed_verified') === 'true';
      const storedEmail = localStorage.getItem('story_seed_user_email');
      const storedName = localStorage.getItem('story_seed_user_name');

      if (storedVerified && storedEmail) {
        setIsVerified(true);
        setVerificationEmail(storedEmail);
        if (storedName) setVoterName(storedName);
        setCheckingAuth(false);
        return;
      }

      // Check Supabase session
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user?.email) {
        setIsVerified(true);
        setVerificationEmail(session.user.email);
        localStorage.setItem('story_seed_verified', 'true');
        localStorage.setItem('story_seed_user_email', session.user.email);
        localStorage.setItem('story_seed_user_id', session.user.id);

        // Try to get name from registrations or user metadata
        const userName = session.user.user_metadata?.full_name || session.user.user_metadata?.name;
        if (userName) {
          setVoterName(userName.split(' ')[0]);
          localStorage.setItem('story_seed_user_name', userName.split(' ')[0]);
        } else {
          const { data: registration } = await supabase
            .from('registrations')
            .select('first_name')
            .eq('email', session.user.email)
            .limit(1)
            .maybeSingle();

          if (registration?.first_name) {
            setVoterName(registration.first_name);
            localStorage.setItem('story_seed_user_name', registration.first_name);
          }
        }
      }

      setCheckingAuth(false);
    };

    checkVerification();

    // Listen for auth state changes (OAuth callback)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user?.email) {
        setIsVerified(true);
        setVerificationEmail(session.user.email);
        localStorage.setItem('story_seed_verified', 'true');
        localStorage.setItem('story_seed_user_email', session.user.email);
        localStorage.setItem('story_seed_user_id', session.user.id);

        const userName = session.user.user_metadata?.full_name || session.user.user_metadata?.name;
        if (userName) {
          setVoterName(userName.split(' ')[0]);
          localStorage.setItem('story_seed_user_name', userName.split(' ')[0]);
        }
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  // Handle Google Sign In for voting
  const handleGoogleSignIn = async () => {
    setIsSigningIn(true);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/voting/${eventId || ''}`,
        },
      });

      if (error) throw error;
    } catch (error: any) {
      console.error('Error signing in with Google:', error);
      toast({
        title: 'Sign In Failed',
        description: error.message || 'Could not sign in with Google. Please try again.',
        variant: 'destructive',
      });
      setIsSigningIn(false);
    }
  };

  // Fetch judge rankings and get eligible participants for voting (excluding top 6 winners)
  const fetchJudgeRankingsForVoting = useCallback(async (eventIdToFetch: string) => {
    try {
      // Fetch registrations for this event
      const { data: registrations } = await supabase
        .from('registrations')
        .select('id, class_level')
        .eq('event_id', eventIdToFetch);

      if (!registrations || registrations.length === 0) {
        setEligibleForVotingIds(new Set());
        setJudgeTop6Ids(new Set());
        return;
      }

      // Fetch all votes with scores
      const { data: votes } = await supabase
        .from('votes')
        .select('registration_id, user_id, score');

      // Fetch judge user IDs using the has_role function or user_roles table
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('user_id, role');

      const judgeUserIds = new Set(
        (userRoles || [])
          .filter(ur => ur.role === 'judge')
          .map(ur => ur.user_id)
      );

      // Calculate judge scores per registration
      const scoreData: Record<string, { total: number; count: number }> = {};
      (votes || []).forEach(vote => {
        if (judgeUserIds.has(vote.user_id)) {
          if (!scoreData[vote.registration_id]) {
            scoreData[vote.registration_id] = { total: 0, count: 0 };
          }
          scoreData[vote.registration_id].total += vote.score;
          scoreData[vote.registration_id].count += 1;
        }
      });

      // Get entries with judge scores, sorted by average score
      const entriesWithScores = registrations
        .map(reg => ({
          id: reg.id,
          class_level: (reg as any).class_level as string | null,
          average_score: scoreData[reg.id] ? scoreData[reg.id].total / scoreData[reg.id].count : 0,
          total_reviews: scoreData[reg.id]?.count || 0,
        }))
        .sort((a, b) => {
          if (b.average_score !== a.average_score) return b.average_score - a.average_score;
          return b.total_reviews - a.total_reviews;
        });

      // Get balanced top 6 - ranking method:
      // 1st: Highest from Tiny Tales, 2nd: Highest from Young Dreamers, 3rd: Highest from Story Champions
      // 4th: 2nd highest from Tiny Tales, 5th: 2nd highest from Young Dreamers, 6th: 2nd highest from Story Champions
      const classLevels = ['Tiny Tales', 'Young Dreamers', 'Story Champions'];
      const top6: typeof entriesWithScores = [];

      // Group by class level
      const entriesByLevel: Record<string, typeof entriesWithScores> = {};
      for (const level of classLevels) {
        entriesByLevel[level] = entriesWithScores.filter(e => e.class_level === level);
      }

      // First round: Pick highest from each class level (positions 1, 2, 3)
      for (const level of classLevels) {
        if (entriesByLevel[level].length >= 1) {
          top6.push(entriesByLevel[level][0]);
        }
      }

      // Second round: Pick second highest from each class level (positions 4, 5, 6)
      for (const level of classLevels) {
        if (entriesByLevel[level].length >= 2) {
          top6.push(entriesByLevel[level][1]);
        }
      }

      // Fill remaining with top entries if needed (in case some classes have fewer than 2)
      if (top6.length < 6) {
        const top6Ids = new Set(top6.map(e => e.id));
        const remaining = entriesWithScores.filter(e => !top6Ids.has(e.id));
        top6.push(...remaining.slice(0, 6 - top6.length));
      }

      const top6Ids = new Set(top6.slice(0, 6).map(e => e.id));
      setJudgeTop6Ids(top6Ids);

      // All remaining entries after top 6 are eligible for community voting
      const remainingAfterTop6 = entriesWithScores.filter(e => !top6Ids.has(e.id));

      // If no judge votes yet, all registrations are eligible (admin opened voting manually)
      if (Object.keys(scoreData).length === 0) {
        setEligibleForVotingIds(new Set(registrations.map(r => r.id)));
      } else {
        setEligibleForVotingIds(new Set(remainingAfterTop6.map(e => e.id)));
      }
    } catch (error) {
      console.error('Error fetching judge rankings:', error);
      // On error, still allow voting for all registrations if admin opened voting
      setEligibleForVotingIds(new Set());
      setJudgeTop6Ids(new Set());
    }
  }, []);

  const fetchContestants = useCallback(async (force = false) => {
    if (!eventId) {
      setLoading(false);
      return;
    }

    // Prevent fetching too frequently unless forced
    const now = Date.now();
    if (!force && now - lastFetchTime < 1000) {
      return;
    }
    setLastFetchTime(now);

    try {
      const { data: eventData, error: eventError } = await supabase
        .from('events')
        .select('id, name, voting_open')
        .eq('id', eventId)
        .single();

      if (eventError || !eventData) {
        setLoading(false);
        return;
      }

      // Check if admin has opened voting for this event
      setVotingOpen(eventData.voting_open === true);

      const { data: registrations, error } = await supabase
        .from('registrations')
        .select('id, first_name, last_name, story_title, story_description, age, category, class_level, yt_link, overall_votes, overall_views, city, email, phone, created_at, events:events!registrations_event_id_fkey(name)')
        .eq('event_id', eventId)
        .order('overall_votes', { ascending: false });

      if (error) {
        console.error('Error fetching contestants:', error);
        setLoading(false);
        return;
      }

      const formattedContestants = (registrations || []).map((reg) => ({
        id: reg.id,
        first_name: reg.first_name,
        last_name: reg.last_name,
        story_title: reg.story_title,
        story_description: reg.story_description || '',
        age: reg.age,
        category: reg.category,
        class_level: (reg as any).class_level || null,
        yt_link: reg.yt_link,
        overall_votes: reg.overall_votes || 0,
        overall_views: reg.overall_views || 0,
        photo: `https://api.dicebear.com/8.x/initials/svg?seed=${reg.first_name}${reg.last_name}&backgroundColor=9B1B1B&textColor=ffffff`,
        event_name: (reg.events as any)?.name || eventData.name || 'Unknown Event',
        city: reg.city || '',
        email: reg.email || '',
        phone: reg.phone || '',
        created_at: reg.created_at || '',
      }));

      // Fetch judge rankings to determine eligible participants for voting
      await fetchJudgeRankingsForVoting(eventId);

      setContestants(formattedContestants);
    } catch (error) {
      console.error('Error fetching contestants:', error);
    } finally {
      setLoading(false);
    }
  }, [eventId, lastFetchTime, fetchJudgeRankingsForVoting]);

  // Initial fetch and real-time subscriptions
  useEffect(() => {
    fetchContestants(true);

    if (eventId) {
      // Subscribe to registrations changes (for votes/views updates)
      const registrationsChannel = supabase
        .channel(`voting-registrations-${eventId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'registrations',
            filter: `event_id=eq.${eventId}`,
          },
          (payload) => {
            // Update the specific contestant in real-time
            if (payload.new && typeof payload.new === 'object' && 'id' in payload.new) {
              const updatedReg = payload.new as any;
              setContestants((prev) =>
                prev.map((c) =>
                  c.id === updatedReg.id
                    ? { ...c, overall_votes: updatedReg.overall_votes || 0, overall_views: updatedReg.overall_views || 0 }
                    : c
                )
              );
              // Also update selected contestant if it's the same one
              setSelectedContestant((prev) =>
                prev && prev.id === updatedReg.id
                  ? { ...prev, overall_votes: updatedReg.overall_votes || 0, overall_views: updatedReg.overall_views || 0 }
                  : prev
              );
            }
          }
        )
        .subscribe();

      // Subscribe to voter_details inserts (for real-time vote tracking)
      const voterChannel = supabase
        .channel(`voter-details-${eventId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'voter_details',
          },
          () => {
            // Refetch to get updated counts
            fetchContestants(true);
          }
        )
        .subscribe();

      // Subscribe to views inserts (for real-time view tracking)
      const viewsChannel = supabase
        .channel(`views-${eventId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'views',
          },
          () => {
            // Refetch to get updated counts
            fetchContestants(true);
          }
        )
        .subscribe();

      // Subscribe to events changes (for voting_open status)
      const eventsChannel = supabase
        .channel(`voting-events-${eventId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'events',
            filter: `id=eq.${eventId}`,
          },
          (payload) => {
            if (payload.new && typeof payload.new === 'object' && 'voting_open' in payload.new) {
              setVotingOpen((payload.new as any).voting_open === true);
              // Refetch to update eligible participants
              fetchContestants(true);
            }
          }
        )
        .subscribe();

      // Subscribe to votes changes (for real-time judge ranking updates)
      const votesChannel = supabase
        .channel(`voting-votes-${eventId}`)
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'votes',
          },
          () => {
            // Refetch to update judge rankings
            fetchJudgeRankingsForVoting(eventId);
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(registrationsChannel);
        supabase.removeChannel(voterChannel);
        supabase.removeChannel(viewsChannel);
        supabase.removeChannel(eventsChannel);
        supabase.removeChannel(votesChannel);
      };
    }
  }, [eventId, fetchContestants, fetchJudgeRankingsForVoting]);

  // Refetch when page becomes visible (handles tab switches and navigation)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && eventId) {
        fetchContestants(true);
      }
    };

    const handleFocus = () => {
      if (eventId) {
        fetchContestants(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
    };
  }, [eventId, fetchContestants]);

  // Check if voter can vote for this contestant (24-hour cooldown)
  const checkCanVote = async (registrationId: string, phone: string): Promise<{ canVote: boolean; reason?: string }> => {
    if (!phone || phone.length !== 10) {
      return { canVote: true };
    }

    try {
      const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const { data, error } = await supabase
        .from('voter_details')
        .select('id, created_at')
        .eq('registration_id', registrationId)
        .eq('phone', phone)
        .gte('created_at', twentyFourHoursAgo)
        .order('created_at', { ascending: false })
        .limit(1);

      if (error) {
        console.error('Error checking vote status:', error);
        return { canVote: true };
      }

      if (data && data.length > 0) {
        const lastVoteTime = new Date(data[0].created_at);
        const now = new Date();
        const timeDiff = now.getTime() - lastVoteTime.getTime();
        const hoursRemaining = Math.ceil((24 * 60 * 60 * 1000 - timeDiff) / (1000 * 60 * 60));

        return {
          canVote: false,
          reason: `You already voted for this contestant. You can vote again in ${hoursRemaining} hour${hoursRemaining > 1 ? 's' : ''}`
        };
      }

      return { canVote: true };
    } catch (error) {
      console.error('Error checking vote status:', error);
      return { canVote: true };
    }
  };

  // Check vote status and record view when phone changes
  useEffect(() => {
    const checkVoteStatusAndView = async () => {
      if (selectedContestant && voterPhone.length === 10) {
        setCheckingVote(true);
        const status = await checkCanVote(selectedContestant.id, voterPhone);
        setCanVoteStatus(status);
        setCheckingVote(false);

        // Record view when valid phone is entered (only once per voter per video)
        if (!hasRecordedView) {
          recordView(selectedContestant.id, voterPhone);
        }
      } else {
        setCanVoteStatus({ canVote: true });
      }
    };

    checkVoteStatusAndView();
  }, [voterPhone, selectedContestant, hasRecordedView]);

  // Check if voter already viewed this registration (to prevent spam views)
  const checkHasViewed = async (registrationId: string, phone: string): Promise<boolean> => {
    if (!phone || phone.length !== 10) {
      return false;
    }

    try {
      const { data, error } = await supabase
        .from('voter_details')
        .select('id')
        .eq('registration_id', registrationId)
        .eq('phone', phone)
        .limit(1);

      if (error) {
        console.error('Error checking view status:', error);
        return false;
      }

      return data && data.length > 0;
    } catch (error) {
      console.error('Error checking view status:', error);
      return false;
    }
  };

  // Record view only if voter hasn't viewed this registration before
  const recordView = async (registrationId: string, phone: string) => {
    if (!phone || phone.length !== 10) return;

    // Check if already viewed by this phone number using voter_details
    const alreadyViewed = await checkHasViewed(registrationId, phone);
    if (alreadyViewed) {
      console.log('View already recorded for this voter');
      setHasRecordedView(true);
      return;
    }

    try {
      await supabase.from('views').insert({
        registration_id: registrationId,
        user_id: null,
        ip_address: phone, // Store phone as identifier for view tracking
      });
      setHasRecordedView(true);
    } catch (error) {
      console.error('Error recording view:', error);
    }
  };

  const handleContestantClick = async (contestant: Contestant) => {
    setSelectedContestant(contestant);
    setIsModalOpen(true);
    setVoterPhone('');
    setCanVoteStatus({ canVote: true });
    setHasRecordedView(false);
  };

  const handleVote = async () => {
    if (!selectedContestant || !eventId) return;

    if (!voterName.trim() || !voterPhone.trim()) {
      toast({
        title: 'Missing Information',
        description: 'Please enter your name and phone number to vote.',
        variant: 'destructive',
      });
      return;
    }

    // Validate phone (should be 10 digits)
    const phoneDigits = voterPhone.replace(/\D/g, '');
    if (phoneDigits.length !== 10) {
      toast({
        title: 'Invalid Phone Number',
        description: 'Please enter a valid 10-digit phone number.',
        variant: 'destructive',
      });
      return;
    }

    // Check 24-hour cooldown from database
    const voteCheck = await checkCanVote(selectedContestant.id, phoneDigits);
    if (!voteCheck.canVote) {
      toast({
        title: 'Cannot Vote Yet',
        description: voteCheck.reason || 'You need to wait 24 hours before voting again.',
        variant: 'destructive',
      });
      return;
    }

    setVoting(true);

    try {
      // 1. Insert voter details into voter_details table
      const { error: voterError } = await supabase.from('voter_details').insert({
        name: voterName.trim(),
        phone: phoneDigits,
        registration_id: selectedContestant.id,
      });

      if (voterError) {
        throw voterError;
      }

      // 2. Increment vote count in registrations table
      const { error: updateError } = await supabase
        .from('registrations')
        .update({ overall_votes: (selectedContestant.overall_votes || 0) + 1 })
        .eq('id', selectedContestant.id);

      if (updateError) {
        throw updateError;
      }

      // 3. Send webhook notification
      try {
        await fetch('https://kamalesh-tech-aiii.app.n8n.cloud/webhook/voter-whatsapp notification', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: voterName.trim(),
            phone: phoneDigits,
            yt_link: selectedContestant.yt_link || '',
          }),
        });
      } catch (webhookError) {
        console.error('Webhook notification failed:', webhookError);
        // Don't fail the vote if webhook fails
      }

      // Update local state
      setContestants((prev) =>
        prev.map((c) =>
          c.id === selectedContestant.id
            ? { ...c, overall_votes: (c.overall_votes || 0) + 1 }
            : c
        )
      );

      toast({
        title: 'Vote Recorded! 🎉',
        description: `Thank you for voting for ${selectedContestant.first_name} ${selectedContestant.last_name}!`,
      });

      setIsModalOpen(false);
      setVoterPhone('');
      setCanVoteStatus({ canVote: true });
    } catch (error) {
      console.error('Error voting:', error);
      toast({
        title: 'Vote Failed',
        description: 'Could not record your vote. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setVoting(false);
    }
  };

  const handleShare = () => {
    if (!selectedContestant || !eventId) return;
    setIsShareModalOpen(true);
  };

  const getShareUrl = () => {
    if (!selectedContestant || !eventId) return '';
    return `${window.location.origin}/voting/${eventId}?contestant=${selectedContestant.id}`;
  };

  const getShareText = () => {
    if (!selectedContestant) return '';
    return `Check out this amazing story: ${selectedContestant.story_title} by ${selectedContestant.first_name} ${selectedContestant.last_name}. Vote now!`;
  };

  const copyToClipboard = () => {
    const shareUrl = getShareUrl();
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopiedLink(true);
      toast({
        title: 'Link Copied!',
        description: 'Voting link has been copied to clipboard.',
      });
      setTimeout(() => setCopiedLink(false), 2000);
    }).catch(() => {
      toast({
        title: 'Copy Failed',
        description: 'Could not copy link. Please try again.',
        variant: 'destructive',
      });
    });
  };

  const shareOnWhatsApp = () => {
    const shareUrl = getShareUrl();
    const shareText = getShareText();
    const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(`${shareText} ${shareUrl}`)}`;
    window.open(whatsappUrl, '_blank');
  };

  const shareOnFacebook = () => {
    const shareUrl = getShareUrl();
    const facebookUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`;
    window.open(facebookUrl, '_blank', 'width=600,height=400');
  };

  const shareOnInstagram = () => {
    copyToClipboard();
    toast({
      title: 'Link Copied!',
      description: 'Instagram doesn\'t support direct sharing. The link has been copied to your clipboard. You can paste it in your Instagram story or post.',
    });
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setSelectedContestant(null);
    setVoterPhone('');
    setCanVoteStatus({ canVote: true });
    setHasRecordedView(false);
  };

  // Handle phone input - only allow 10 digits
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const digits = value.replace(/\D/g, '');
    if (digits.length <= 10) {
      setVoterPhone(digits);
    }
  };

  // Check if contestant was shared via URL
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const contestantId = urlParams.get('contestant');
    if (contestantId && contestants.length > 0) {
      const contestant = contestants.find(c => c.id === contestantId);
      if (contestant) {
        handleContestantClick(contestant);
        window.history.replaceState({}, '', window.location.pathname);
      }
    }
  }, [contestants]);

  // Check if URL is a YouTube URL
  const isYouTubeUrl = (url: string | null): boolean => {
    if (!url) return false;
    return url.includes('youtube.com') || url.includes('youtu.be');
  };

  // Get YouTube embed URL
  const getYouTubeEmbedUrl = (url: string | null): string | null => {
    if (!url) return null;

    // Already an embed URL
    if (url.includes('/embed/')) {
      return url;
    }

    // Extract video ID from various YouTube URL formats
    let videoId = null;

    // youtu.be/VIDEO_ID
    const shortMatch = url.match(/youtu\.be\/([a-zA-Z0-9_-]+)/);
    if (shortMatch) {
      videoId = shortMatch[1];
    }

    // youtube.com/watch?v=VIDEO_ID
    const watchMatch = url.match(/[?&]v=([a-zA-Z0-9_-]+)/);
    if (watchMatch) {
      videoId = watchMatch[1];
    }

    if (videoId) {
      return `https://www.youtube.com/embed/${videoId}`;
    }

    return url;
  };

  // Loading state
  if (checkingAuth || loading) {
    return (
      <div className="pt-20 min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Email verification required
  if (!isVerified) {
    return (
      <div className="min-h-screen bg-background page-enter">
        {/* Header */}
        <section className="pt-20 pb-8 sm:pb-12 bg-gradient-warm relative overflow-hidden">
          <div className="absolute inset-0">
            <div className="absolute top-10 left-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
            <div className="absolute bottom-10 right-10 w-96 h-96 bg-secondary/5 rounded-full blur-3xl" />
          </div>
          <div className="container mx-auto px-4 relative z-10">
            <div className="text-center">
              <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-4">
                Vote for Your <span className="text-gradient">Favorites</span>
              </h1>
              <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
                Sign in with Google to start voting for amazing stories
              </p>
            </div>
          </div>
        </section>

        {/* Google Sign In */}
        <section className="py-12 container mx-auto px-4">
          <div className="max-w-md mx-auto">
            <div className="bg-card rounded-2xl p-8 border border-border/50 shadow-lg">
              <div className="space-y-6">
                <div className="text-center mb-6">
                  <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <User className="w-8 h-8 text-primary" />
                  </div>
                  <h2 className="font-display text-2xl font-semibold text-foreground">Sign In to Vote</h2>
                  <p className="text-muted-foreground mt-2">Use your Google account to verify and vote</p>
                </div>

                <Button
                  onClick={handleGoogleSignIn}
                  disabled={isSigningIn}
                  className="w-full h-14 text-lg font-semibold bg-white text-black border-2 border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-3 group shadow-sm hover:shadow-md"
                >
                  {isSigningIn ? (
                    <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  ) : (
                    <>
                      <svg className="w-6 h-6" viewBox="0 0 24 24">
                        <path
                          fill="currentColor"
                          d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                        />
                        <path
                          fill="currentColor"
                          d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                        />
                        <path
                          fill="currentColor"
                          d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                        />
                      </svg>
                      Continue with Google
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </section>
      </div>
    );
  }

  if (!eventId) {
    return (
      <div className="pt-20 min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md mx-auto px-4">
          <h1 className="font-display text-3xl font-bold text-foreground mb-4">
            No Event Selected
          </h1>
          <p className="text-muted-foreground mb-8">
            Please select an event to view contestants and vote.
          </p>
          <Link to="/events">
            <Button variant="hero">
              Browse Events
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  if (contestants.length === 0) {
    return (
      <div className="pt-20 min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md mx-auto px-4">
          <h1 className="font-display text-3xl font-bold text-foreground mb-4">
            No Contestants Yet
          </h1>
          <p className="text-muted-foreground mb-8">
            There are no contestants registered for this event yet. Check back later!
          </p>
          <Link to="/events">
            <Button variant="hero">
              Browse Events
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Show message if voting is not open by admin
  if (!votingOpen) {
    return (
      <div className="pt-20 min-h-screen flex items-center justify-center bg-background">
        <div className="text-center max-w-md mx-auto px-4">
          <h1 className="font-display text-3xl font-bold text-foreground mb-4">
            Voting Not Open Yet
          </h1>
          <p className="text-muted-foreground mb-8">
            Community voting has not been opened for this event yet. Please check back later!
          </p>
          <Link to="/leaderboard">
            <Button variant="hero">
              View Leaderboard
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  // Filter contestants - exclude judge top 6 and apply search query
  const filteredContestants = contestants.filter((contestant) => {
    // Exclude judge top 6 winners from community voting
    if (judgeTop6Ids.has(contestant.id)) return false;

    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      contestant.first_name.toLowerCase().includes(query) ||
      contestant.last_name.toLowerCase().includes(query) ||
      contestant.story_title.toLowerCase().includes(query) ||
      contestant.category.toLowerCase().includes(query)
    );
  });

  return (
    <div className="min-h-screen bg-background page-enter">
      {/* Header */}
      <section className="pt-20 pb-8 sm:pb-12 bg-gradient-warm relative overflow-hidden">
        <div className="absolute inset-0">
          <div className="absolute top-10 left-10 w-64 h-64 bg-primary/5 rounded-full blur-3xl" />
          <div className="absolute bottom-10 right-10 w-96 h-96 bg-secondary/5 rounded-full blur-3xl" />
        </div>
        <div className="container mx-auto px-4 relative z-10">
          {/* Back Button */}
          <div className="mb-6">
            <button
              onClick={() => navigate(-1)}
              className={cn(
                "group relative backdrop-blur-xl bg-white/80 dark:bg-black/40 border border-white/30 dark:border-white/20",
                "rounded-2xl px-4 py-3 shadow-lg hover:shadow-2xl transition-all duration-300",
                "hover:scale-105 hover:border-primary/50 flex items-center gap-2",
                "bg-primary/10 hover:bg-primary/20 border-primary/30 hover:border-primary/50"
              )}
            >
              <ArrowLeft className="w-5 h-5 text-primary group-hover:text-primary-foreground transition-colors" />
              <span className="font-medium text-primary group-hover:text-primary-foreground transition-colors">
                Back
              </span>
            </button>
          </div>
          <div className="text-center">
            <h1 className="font-display text-4xl md:text-5xl font-bold text-foreground mb-4">
              Vote for Your <span className="text-gradient">Favorites</span>
            </h1>
            <p className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Support young storytellers by voting for the stories that inspire you the most
            </p>
            {isVerified && verificationEmail && (
              <p className="text-sm text-primary mt-2">
                Voting as: {verificationEmail}
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Search Box */}
      <section className="py-4 sm:py-6 container mx-auto px-4">
        <div className="max-w-md mx-auto">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground z-10" />
            <Input
              type="search"
              placeholder="Search contestants by name, story title, or category..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 w-full h-12 bg-background/80 backdrop-blur-sm border-border/60 focus:bg-background shadow-lg"
            />
          </div>
        </div>
      </section>

      {/* Contestants Grid */}
      <section className="py-6 sm:py-12 container mx-auto px-4">
        {filteredContestants.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground text-lg">
              {searchQuery.trim() ? 'No contestants found matching your search.' : 'No contestants available.'}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4 sm:gap-6">
            {filteredContestants.map((contestant, index) => (
              <button
                key={contestant.id}
                onClick={() => handleContestantClick(contestant)}
                className={cn(
                  'group relative aspect-square rounded-2xl overflow-hidden',
                  'backdrop-blur-xl bg-white/10 dark:bg-black/10 border border-white/20 dark:border-white/10',
                  'shadow-lg hover:shadow-2xl transition-all duration-300',
                  'hover:scale-105 animate-fade-in'
                )}
                style={{ animationDelay: `${index * 0.05}s` }}
              >
                {/* Profile Photo */}
                <div className="absolute inset-0">
                  <img
                    src={contestant.photo}
                    alt={`${contestant.first_name} ${contestant.last_name}`}
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
                </div>

                {/* Name Overlay */}
                <div className="absolute bottom-0 left-0 right-0 p-3">
                  <p className="text-white font-semibold text-sm truncate">
                    {contestant.first_name} {contestant.last_name}
                  </p>
                  <div className="flex items-center gap-3 mt-1">
                    <div className="flex items-center gap-1">
                      <ThumbsUp className="w-3 h-3 text-white" />
                      <span className="text-white text-xs">{contestant.overall_votes}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <Eye className="w-3 h-3 text-white" />
                      <span className="text-white text-xs">{contestant.overall_views}</span>
                    </div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* Modal */}
      {isModalOpen && selectedContestant && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm" style={{ top: 0 }}>
          <div className="relative w-full max-w-2xl bg-card rounded-2xl shadow-2xl border border-border/50 max-h-[90vh] overflow-y-auto">
            {/* Close Button */}
            <button
              onClick={handleCloseModal}
              className="absolute top-4 right-4 z-10 w-10 h-10 rounded-full bg-background/80 backdrop-blur-sm border border-border flex items-center justify-center hover:bg-background transition-colors"
            >
              <X className="w-5 h-5 text-foreground" />
            </button>

            <div className="p-6 space-y-6">
              {/* Video Player */}
              <div className="relative aspect-video rounded-xl overflow-hidden bg-muted">
                {selectedContestant.yt_link ? (
                  isYouTubeUrl(selectedContestant.yt_link) ? (
                    <iframe
                      src={getYouTubeEmbedUrl(selectedContestant.yt_link) || ''}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <video
                      src={getSafeImageUrl(selectedContestant.yt_link)}
                      className="w-full h-full object-contain bg-black"

                      controls
                      controlsList="nodownload"
                      playsInline
                      autoPlay={false}
                    />
                  )
                ) : (
                  <div className="w-full h-full flex items-center justify-center">
                    <div className="text-center">
                      <Play className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                      <p className="text-muted-foreground">Video coming soon</p>
                    </div>
                  </div>
                )}
              </div>

              {/* Contestant Info */}
              <div>
                <h2 className="font-display text-2xl font-bold text-foreground mb-2">
                  {selectedContestant.first_name} {selectedContestant.last_name}
                </h2>
                <div className="flex flex-wrap items-center gap-2 text-muted-foreground mb-4">
                  <span>Age {selectedContestant.age}</span>
                  <span>•</span>
                  <span>{selectedContestant.category}</span>
                  {selectedContestant.city && (
                    <>
                      <span>•</span>
                      <span>{selectedContestant.city}</span>
                    </>
                  )}
                  {selectedContestant.event_name && (
                    <>
                      <span>•</span>
                      <span className="text-primary font-medium">{selectedContestant.event_name}</span>
                    </>
                  )}
                </div>
                <p className="text-foreground mb-2">
                  <span className="font-semibold">Story:</span> {selectedContestant.story_title}
                </p>
                <p className="text-sm text-muted-foreground mb-4">
                  {selectedContestant.story_description}
                </p>
                <div className="flex items-center gap-4 mt-4">
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <ThumbsUp className="w-4 h-4" />
                    <span>{selectedContestant.overall_votes} votes</span>
                  </div>
                  <div className="flex items-center gap-1 text-muted-foreground">
                    <Eye className="w-4 h-4" />
                    <span>{selectedContestant.overall_views} views</span>
                  </div>
                </div>
              </div>

              {/* Voter Details */}
              <div className="bg-card rounded-2xl p-6 border border-border/50 shadow-lg">
                <h3 className="font-display text-xl font-semibold text-foreground mb-6">
                  Enter Your Details to Vote
                </h3>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 font-medium text-foreground">
                      <User className="w-4 h-4" />
                      Your Name
                    </Label>
                    <Input
                      placeholder="Enter your name"
                      value={voterName}
                      onChange={(e) => setVoterName(e.target.value)}
                      className="w-full"
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2 font-medium text-foreground">
                      <Phone className="w-4 h-4" />
                      Phone Number
                    </Label>
                    <div className="relative">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2 flex items-center gap-2 z-10">
                        <span className="text-lg">🇮🇳</span>
                        <span className="text-sm font-medium text-foreground">+91</span>
                      </div>
                      <Input
                        type="tel"
                        placeholder="98765 43210"
                        value={voterPhone}
                        onChange={handlePhoneChange}
                        className="pl-20 w-full"
                        maxLength={10}
                        required
                      />
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Enter your 10-digit mobile number
                    </p>
                  </div>
                  {checkingVote && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">Checking vote status...</span>
                    </div>
                  )}
                  {!checkingVote && !canVoteStatus.canVote && canVoteStatus.reason && (
                    <div className="bg-destructive/10 p-3 rounded-lg border border-destructive/20">
                      <p className="text-sm text-destructive">
                        {canVoteStatus.reason}
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  variant="hero"
                  onClick={handleVote}
                  disabled={voting || !voterName.trim() || voterPhone.length !== 10 || !canVoteStatus.canVote}
                  className="flex-1"
                >
                  {voting ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Voting...
                    </>
                  ) : !canVoteStatus.canVote ? (
                    <>
                      <ThumbsUp className="w-4 h-4 mr-2" />
                      Already Voted
                    </>
                  ) : (
                    <>
                      <ThumbsUp className="w-4 h-4 mr-2" />
                      Vote Now
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleShare}
                  className="flex-1"
                >
                  <Share2 className="w-4 h-4 mr-2" />
                  Share
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Share Modal */}
      <Dialog open={isShareModalOpen} onOpenChange={setIsShareModalOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Share This Story</DialogTitle>
            <DialogDescription>
              Share this amazing story with your friends and family
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* Share Link Input */}
            <div className="space-y-2">
              <Label>Share Link</Label>
              <div className="flex items-center gap-2">
                <Input
                  value={getShareUrl()}
                  readOnly
                  className="flex-1 font-mono text-sm"
                />
                <Button
                  variant="outline"
                  size="icon"
                  onClick={copyToClipboard}
                  className="shrink-0"
                >
                  {copiedLink ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Copy className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>

            {/* Social Share Buttons */}
            <div className="grid grid-cols-2 gap-3">
              <Button
                variant="outline"
                onClick={copyToClipboard}
                className="flex items-center justify-center gap-2 h-12"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-5 h-5 text-green-500" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="w-5 h-5" />
                    Copy Link
                  </>
                )}
              </Button>

              <Button
                variant="outline"
                onClick={shareOnWhatsApp}
                className="flex items-center justify-center gap-2 h-12 bg-green-50 hover:bg-green-100 dark:bg-green-950 dark:hover:bg-green-900 border-green-200 dark:border-green-800"
              >
                <MessageCircle className="w-5 h-5 text-green-600 dark:text-green-400" />
                WhatsApp
              </Button>

              <Button
                variant="outline"
                onClick={shareOnFacebook}
                className="flex items-center justify-center gap-2 h-12 bg-blue-50 hover:bg-blue-100 dark:bg-blue-950 dark:hover:bg-blue-900 border-blue-200 dark:border-blue-800"
              >
                <Facebook className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                Facebook
              </Button>

              <Button
                variant="outline"
                onClick={shareOnInstagram}
                className="flex items-center justify-center gap-2 h-12 bg-pink-50 hover:bg-pink-100 dark:bg-pink-950 dark:hover:bg-pink-900 border-pink-200 dark:border-pink-800"
              >
                <Instagram className="w-5 h-5 text-pink-600 dark:text-pink-400" />
                Instagram
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default Voting;
