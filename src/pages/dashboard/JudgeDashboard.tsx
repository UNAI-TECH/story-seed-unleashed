import { useState, useRef, useEffect } from 'react';
import { FileText, CheckCircle, Clock, Star, Eye, Vote, Play, Pause, Maximize, Gauge } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { StatsCard } from '@/components/dashboard/StatsCard';
import { useAuth } from '@/contexts/AuthContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

type Participant = {
  id: string;
  name: string;
  storyTitle: string;
  age: number;
  category: string;
  photo: string;
  videoUrl: string;
  registrationId: string;
  hasVoted: boolean;
};

type EventWithParticipants = {
  id: string;
  eventName: string;
  participants: Participant[];
  totalParticipants: number;
  selectedByJudge: number;
  rejectedByJudge: number;
};

type RecentReview = {
  id: string;
  title: string;
  score: number;
  status: string;
  created_at: string;
};

const JudgeDashboard = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [selectedSubmission, setSelectedSubmission] = useState<EventWithParticipants | null>(null);
  const [isVotingOpen, setIsVotingOpen] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [voteScore, setVoteScore] = useState([50]);
  const [videoProgress, setVideoProgress] = useState([0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState('1');
  const videoRef = useRef<HTMLVideoElement>(null);

  // Real-time stats
  const [pendingReviews, setPendingReviews] = useState(0);
  const [reviewedToday, setReviewedToday] = useState(0);
  const [totalReviews, setTotalReviews] = useState(0);
  const [avgScore, setAvgScore] = useState('0.0');
  const [pendingSubmissions, setPendingSubmissions] = useState<EventWithParticipants[]>([]);
  const [recentReviews, setRecentReviews] = useState<RecentReview[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchJudgeStats = async () => {
    if (!user?.id) return;

    try {
      // Get all votes by this judge
      const { data: votes, error: votesError } = await supabase
        .from('votes')
        .select('id, score, created_at, registration_id')
        .eq('user_id', user.id);

      if (votesError) throw votesError;

      // Calculate stats
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const todayVotes = votes?.filter(v => new Date(v.created_at) >= today) || [];
      const totalVotes = votes?.length || 0;
      const avgScoreCalc = totalVotes > 0
        ? (votes?.reduce((sum, v) => sum + v.score, 0) || 0) / totalVotes
        : 0;

      setReviewedToday(todayVotes.length);
      setTotalReviews(totalVotes);
      setAvgScore(avgScoreCalc.toFixed(1));

      // Get voted registration IDs
      const votedRegistrationIds = votes?.map(v => v.registration_id) || [];

      // Get all registrations count for pending
      const { count: totalRegistrations } = await supabase
        .from('registrations')
        .select('id', { count: 'exact', head: true });

      setPendingReviews((totalRegistrations || 0) - votedRegistrationIds.length);

      // Get recent reviews with registration details
      const recentVoteIds = votes?.slice(-5).map(v => v.registration_id) || [];
      if (recentVoteIds.length > 0) {
        const { data: recentRegs } = await supabase
          .from('registrations')
          .select('id, story_title')
          .in('id', recentVoteIds);

        const recentReviewsData = votes?.slice(-5).reverse().map(v => {
          const reg = recentRegs?.find(r => r.id === v.registration_id);
          return {
            id: v.id,
            title: reg?.story_title || 'Unknown Story',
            score: v.score,
            status: v.score >= 5 ? 'Approved' : 'Rejected',
            created_at: v.created_at
          };
        }) || [];

        setRecentReviews(recentReviewsData);
      }

      // Fetch events with participant stats
      const { data: events } = await supabase
        .from('events')
        .select('id, name')
        .eq('is_active', true);

      if (events) {
        const eventsWithParticipants: EventWithParticipants[] = [];

        for (const event of events) {
          // Get all registrations for this event
          const { data: registrations } = await supabase
            .from('registrations')
            .select('id, first_name, last_name, story_title, age, category, yt_link')
            .eq('event_id', event.id);

          const totalParticipants = registrations?.length || 0;

          // Calculate selected (score >= 5) and rejected (score < 5) by this judge for this event
          const eventRegistrationIds = registrations?.map(r => r.id) || [];
          const judgeVotesForEvent = votes?.filter(v => eventRegistrationIds.includes(v.registration_id)) || [];

          const selectedByJudge = judgeVotesForEvent.filter(v => v.score >= 5).length;
          const rejectedByJudge = judgeVotesForEvent.filter(v => v.score < 5).length;

          // Map all participants with voted status
          const allParticipants = registrations?.map(p => ({
            id: p.id,
            name: `${p.first_name} ${p.last_name}`,
            storyTitle: p.story_title,
            age: p.age,
            category: p.category,
            photo: `https://api.dicebear.com/8.x/initials/svg?seed=${p.first_name}${p.last_name}`,
            videoUrl: p.yt_link || '',
            registrationId: p.id,
            hasVoted: votedRegistrationIds.includes(p.id)
          })) || [];

          eventsWithParticipants.push({
            id: event.id,
            eventName: event.name,
            totalParticipants,
            selectedByJudge,
            rejectedByJudge,
            participants: allParticipants
          });
        }

        setPendingSubmissions(eventsWithParticipants);
      }
    } catch (error) {
      console.error('Error fetching judge stats:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJudgeStats();

    // Real-time subscription for votes
    const channel = supabase
      .channel('judge-dashboard-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, () => {
        fetchJudgeStats();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => {
        fetchJudgeStats();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const handleOpenParticipants = (submission: EventWithParticipants) => {
    setSelectedSubmission(submission);
    setIsParticipantsOpen(true);
  };

  const handleOpenVoting = (participant: Participant) => {
    setSelectedParticipant(participant);
    setIsVotingOpen(true);
    setVoteScore([50]);
    setVideoProgress([0]);
  };

  const handleSubmitVote = async () => {
    if (!user?.id || !selectedParticipant) return;

    const score = Math.round((voteScore[0] / 100) * 10);

    try {
      console.log('Submitting vote:', { user_id: user.id, registration_id: selectedParticipant.registrationId, score });

      // Check if the judge already voted on this registration
      const { data: existingVote } = await supabase
        .from('votes')
        .select('id')
        .eq('user_id', user.id)
        .eq('registration_id', selectedParticipant.registrationId)
        .maybeSingle();

      let error;
      if (existingVote) {
        // Update existing vote
        ({ error } = await supabase
          .from('votes')
          .update({ score, updated_at: new Date().toISOString() })
          .eq('id', existingVote.id));
      } else {
        // Insert new vote
        ({ error } = await supabase.from('votes').insert({
          user_id: user.id,
          registration_id: selectedParticipant.registrationId,
          score
        }));
      }

      if (error) {
        console.error('Vote error details:', error);
        throw error;
      }

      toast({
        title: existingVote ? 'Vote Updated!' : 'Vote Submitted!',
        description: `You gave a score of ${score}/10`
      });

      setIsVotingOpen(false);
      fetchJudgeStats();
    } catch (error: any) {
      console.error('Vote submission failed:', error);
      toast({
        title: 'Error',
        description: error.message || 'Failed to submit vote',
        variant: 'destructive'
      });
    }
  };

  const handlePlayPause = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleFullscreen = () => {
    if (videoRef.current) {
      if (videoRef.current.requestFullscreen) {
        videoRef.current.requestFullscreen();
      }
    }
  };

  const handleSpeedChange = (speed: string) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      videoRef.current.playbackRate = parseFloat(speed);
    }
  };

  const handleSeek = (value: number[]) => {
    if (videoRef.current) {
      const time = (value[0] / 100) * videoRef.current.duration;
      videoRef.current.currentTime = time;
      setVideoProgress(value);
    }
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const handleTimeUpdate = () => {
      if (video.duration) {
        const progress = (video.currentTime / video.duration) * 100;
        setVideoProgress([progress]);
      }
    };

    video.addEventListener('timeupdate', handleTimeUpdate);
    video.addEventListener('play', () => setIsPlaying(true));
    video.addEventListener('pause', () => setIsPlaying(false));

    return () => {
      video.removeEventListener('timeupdate', handleTimeUpdate);
      video.removeEventListener('play', () => setIsPlaying(true));
      video.removeEventListener('pause', () => setIsPlaying(false));
    };
  }, [selectedParticipant]);

  // Helper to extract YouTube embed URL
  const getVideoEmbedUrl = (url: string) => {
    if (!url) return '';
    // Handle YouTube URLs
    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (ytMatch) {
      return `https://www.youtube.com/embed/${ytMatch[1]}`;
    }
    return url;
  };

  return (
    <div className="space-y-6 page-enter">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-primary to-red-dark rounded-2xl p-6 text-secondary-foreground">
        <h1 className="font-display text-2xl md:text-3xl font-bold mb-2">
          Welcome, Judge {user?.name?.split(' ')[0]}! ⚖️
        </h1>
        <p className="text-secondary-foreground/80">
          {pendingReviews > 0
            ? `You have ${pendingReviews} pending submissions awaiting your review.`
            : 'All caught up! No pending submissions.'}
        </p>
      </div>

      {/* Stats */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Pending Reviews"
          value={pendingReviews}
          icon={Clock}
          iconColor="text-secondary"
          change={pendingReviews > 3 ? `${Math.min(pendingReviews, 3)} urgent` : 'Up to date'}
          changeType={pendingReviews > 3 ? 'negative' : 'positive'}
        />
        <StatsCard
          title="Reviewed Today"
          value={reviewedToday}
          icon={CheckCircle}
          iconColor="text-primary"
          change={reviewedToday > 0 ? `+${reviewedToday} today` : 'None yet'}
          changeType={reviewedToday > 0 ? 'positive' : 'neutral'}
        />
        <StatsCard
          title="Total Reviews"
          value={totalReviews}
          icon={FileText}
          iconColor="text-accent"
          change="All time"
          changeType="neutral"
        />
        <StatsCard
          title="Avg. Score Given"
          value={avgScore}
          icon={Star}
          iconColor="text-secondary"
          change="Out of 10"
          changeType="neutral"
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Pending Submissions */}
        <div className="bg-card rounded-2xl p-6 border border-border/50">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Pending Submissions
            </h2>
            <Link to="/judge/dashboard/submissions" className="text-primary text-sm hover:underline">
              View All
            </Link>
          </div>
          <div className="space-y-4">
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading...</p>
            ) : pendingSubmissions.length === 0 ? (
              <p className="text-muted-foreground text-sm">No events found</p>
            ) : (
              pendingSubmissions.slice(0, 3).map((submission) => (
                <div
                  key={submission.id}
                  className="flex flex-col p-4 bg-muted/50 rounded-xl hover:bg-muted transition-colors"
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="font-medium text-foreground">{submission.eventName}</p>
                      <p className="text-sm text-muted-foreground">
                        {submission.participants.filter(p => !p.hasVoted).length} pending review(s)
                      </p>
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      type="button"
                      onClick={() => handleOpenParticipants(submission)}
                      disabled={submission.participants.length === 0}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                  {/* Per-event stats */}
                  <div className="grid grid-cols-3 gap-2 text-center pt-3 border-t border-border/50">
                    <div className="bg-background/50 rounded-lg p-2">
                      <p className="text-xs text-muted-foreground">Total</p>
                      <p className="font-semibold text-foreground">{submission.totalParticipants}</p>
                    </div>
                    <div className="bg-green-500/10 rounded-lg p-2">
                      <p className="text-xs text-green-600">Selected</p>
                      <p className="font-semibold text-green-600">{submission.selectedByJudge}</p>
                    </div>
                    <div className="bg-red-500/10 rounded-lg p-2">
                      <p className="text-xs text-red-600">Rejected</p>
                      <p className="font-semibold text-red-600">{submission.rejectedByJudge}</p>
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Reviews */}
        <div className="bg-card rounded-2xl p-6 border border-border/50">
          <div className="flex items-center justify-between mb-6">
            <h2 className="font-display text-xl font-semibold text-foreground">
              Recent Reviews
            </h2>
            <Link to="/judge/dashboard/entries" className="text-primary text-sm hover:underline">
              View All
            </Link>
          </div>
          <div className="space-y-4">
            {recentReviews.length === 0 ? (
              <p className="text-muted-foreground text-sm">No reviews yet</p>
            ) : (
              recentReviews.map((review) => (
                <div
                  key={review.id}
                  className="flex items-center justify-between p-4 bg-muted/50 rounded-xl"
                >
                  <div>
                    <p className="font-medium text-foreground">{review.title}</p>
                    <p className="text-sm text-muted-foreground">
                      Score: {review.score}/10
                    </p>
                  </div>
                  <span
                    className={`px-3 py-1 rounded-full text-xs font-medium ${review.status === 'Approved'
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                      }`}
                  >
                    {review.status}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <Sheet open={isParticipantsOpen} onOpenChange={setIsParticipantsOpen}>
        <SheetContent
          side="right"
          className="bg-background/95 backdrop-blur-lg border-l border-border/60 sm:max-w-md"
        >
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between">
              <span className="font-display text-xl">Participants</span>
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-primary to-red-dark text-primary-foreground font-display text-sm">
                S
              </span>
            </SheetTitle>
            <SheetDescription>
              {selectedSubmission?.eventName
                ? `Submissions for "${selectedSubmission.eventName}"`
                : 'Select an event to view participant details.'}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {selectedSubmission?.participants?.map((participant) => (
              <div
                key={participant.id}
                className={`flex items-center gap-3 rounded-xl border p-3 ${participant.hasVoted
                  ? 'bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-800'
                  : 'bg-muted/40 border-border/60'
                  }`}
              >
                <Avatar className="w-10 h-10">
                  <AvatarImage src={participant.photo} alt={participant.name} />
                  <AvatarFallback>{participant.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-foreground">{participant.name}</p>
                    {participant.hasVoted && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200">
                        Voted
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">{participant.storyTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    Age {participant.age} • {participant.category}
                  </p>
                </div>
                <Button
                  size="sm"
                  variant={participant.hasVoted ? 'ghost' : 'outline'}
                  type="button"
                  onClick={() => handleOpenVoting(participant)}
                  disabled={participant.hasVoted}
                >
                  {participant.hasVoted ? 'Done' : 'Vote'}
                </Button>
              </div>
            ))}
            {!selectedSubmission?.participants?.length && (
              <p className="text-sm text-muted-foreground">
                No participant details available for this event yet.
              </p>
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Voting Panel */}
      <Dialog open={isVotingOpen} onOpenChange={setIsVotingOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-background/95 backdrop-blur-lg border border-border/60">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {selectedParticipant?.storyTitle}
            </DialogTitle>
            <DialogDescription className="sr-only">
              Voting panel for the story {selectedParticipant?.storyTitle}.
            </DialogDescription>
          </DialogHeader>

          {selectedParticipant && (
            <div className="space-y-6 mt-4">
              {/* Video Section */}
              <div className="relative w-full bg-black rounded-xl overflow-hidden aspect-video">
                {selectedParticipant.videoUrl ? (
                  selectedParticipant.videoUrl.includes('youtube') || selectedParticipant.videoUrl.includes('youtu.be') ? (
                    <iframe
                      src={getVideoEmbedUrl(selectedParticipant.videoUrl)}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <>
                      <video
                        ref={videoRef}
                        src={selectedParticipant.videoUrl}
                        className="w-full h-full object-contain"
                        onLoadedMetadata={() => {
                          if (videoRef.current) {
                            setVideoProgress([0]);
                          }
                        }}
                      />
                      {/* Video Controls Overlay */}
                      <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent p-4">
                        <div className="mb-3">
                          <Slider
                            value={videoProgress}
                            onValueChange={handleSeek}
                            max={100}
                            step={0.1}
                            className="w-full"
                          />
                        </div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handlePlayPause}
                              className="bg-background/90 hover:bg-background"
                            >
                              {isPlaying ? (
                                <Pause className="w-4 h-4 text-foreground" />
                              ) : (
                                <Play className="w-4 h-4 text-foreground" />
                              )}
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleFullscreen}
                              className="bg-background/90 hover:bg-background"
                            >
                              <Maximize className="w-4 h-4 text-foreground" />
                            </Button>
                            <Select value={playbackSpeed} onValueChange={handleSpeedChange}>
                              <SelectTrigger className="w-20 h-8 bg-background/90 border-border/60">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0.5">0.5x</SelectItem>
                                <SelectItem value="0.75">0.75x</SelectItem>
                                <SelectItem value="1">1x</SelectItem>
                                <SelectItem value="1.25">1.25x</SelectItem>
                                <SelectItem value="1.5">1.5x</SelectItem>
                                <SelectItem value="2">2x</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="text-sm text-white/80">
                            {videoRef.current &&
                              `${Math.floor(videoRef.current.currentTime || 0)}s / ${Math.floor(
                                videoRef.current.duration || 0
                              )}s`}
                          </div>
                        </div>
                      </div>
                    </>
                  )
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    No video available
                  </div>
                )}
              </div>

              {/* Participant Details */}
              <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/40 border border-border/60">
                <Avatar className="w-16 h-16">
                  <AvatarImage src={selectedParticipant.photo} alt={selectedParticipant.name} />
                  <AvatarFallback>{selectedParticipant.name.charAt(0)}</AvatarFallback>
                </Avatar>
                <div className="flex-1">
                  <p className="font-medium text-foreground text-lg">{selectedParticipant.name}</p>
                  <p className="text-sm text-muted-foreground">{selectedParticipant.storyTitle}</p>
                  <p className="text-sm text-muted-foreground">
                    Age {selectedParticipant.age} • {selectedParticipant.category}
                  </p>
                </div>
              </div>

              {/* Voting Scale */}
              <div className="space-y-4 p-4 rounded-xl bg-muted/40 border border-border/60">
                <div className="flex items-center gap-2">
                  <Gauge className="w-5 h-5 text-primary" />
                  <h3 className="font-display text-lg font-semibold text-foreground">
                    Voting Score (0-10)
                  </h3>
                </div>
                <div className="space-y-3">
                  <Slider
                    value={voteScore}
                    onValueChange={setVoteScore}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Score:</span>
                    <span className="text-lg font-semibold text-primary">
                      {Math.round((voteScore[0] / 100) * 10)}/10
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>0</span>
                    <span>5</span>
                    <span>10</span>
                  </div>
                </div>
                <Button variant="hero" className="w-full mt-4" onClick={handleSubmitVote}>
                  Submit Vote
                  <Vote className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default JudgeDashboard;
