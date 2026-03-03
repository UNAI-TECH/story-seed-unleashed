import { useState, useEffect, useRef } from 'react';
import { Eye, Users, Play, Pause, Maximize, Vote, Gauge, MessageSquare } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { supabase, getSafeImageUrl } from '@/integrations/supabase/client';

import { useAuth } from '@/contexts/AuthContext';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';

type Participant = {
  id: string;
  name: string;
  storyTitle: string;
  storyDescription: string;
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
  pendingCount: number;
  reviewedCount: number;
};

const JudgeSubmissions = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [events, setEvents] = useState<EventWithParticipants[]>([]);
  const [loading, setLoading] = useState(true);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<EventWithParticipants | null>(null);
  const [isVotingOpen, setIsVotingOpen] = useState(false);
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);
  const [voteScore, setVoteScore] = useState([50]);
  const [videoProgress, setVideoProgress] = useState([0]);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState('1');
  const [judgeComment, setJudgeComment] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const [resolvedVideoUrl, setResolvedVideoUrl] = useState<string>('');

  const fetchEvents = async () => {
    if (!user?.id) return;

    try {
      // Get all votes by this judge
      const { data: votes } = await supabase
        .from('votes')
        .select('registration_id')
        .eq('user_id', user.id);

      const votedRegistrationIds = votes?.map(v => v.registration_id) || [];

      // Fetch all active events
      const { data: eventsData } = await supabase
        .from('events')
        .select('id, name')
        .eq('is_active', true);

      if (eventsData) {
        const eventsWithParticipants: EventWithParticipants[] = [];

        for (const event of eventsData) {
          const { data: registrations } = await supabase
            .from('registrations')
            .select('id, first_name, last_name, story_title, story_description, age, category, yt_link')
            .eq('event_id', event.id);

          if (registrations && registrations.length > 0) {
            const participants = registrations.map(p => ({
              id: p.id,
              name: `${p.first_name} ${p.last_name}`,
              storyTitle: p.story_title,
              storyDescription: p.story_description || '',
              age: p.age,
              category: p.category,
              photo: `https://api.dicebear.com/8.x/initials/svg?seed=${p.first_name}${p.last_name}`,
              videoUrl: p.yt_link || '',
              registrationId: p.id,
              hasVoted: votedRegistrationIds.includes(p.id)
            }));

            eventsWithParticipants.push({
              id: event.id,
              eventName: event.name,
              participants,
              pendingCount: participants.filter(p => !p.hasVoted).length,
              reviewedCount: participants.filter(p => p.hasVoted).length
            });
          }
        }

        setEvents(eventsWithParticipants);
      }
    } catch (error) {
      console.error('Error fetching events:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();

    const channel = supabase
      .channel('judge-submissions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'votes' }, () => {
        fetchEvents();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations' }, () => {
        fetchEvents();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const handleOpenParticipants = (event: EventWithParticipants) => {
    setSelectedEvent(event);
    setIsParticipantsOpen(true);
  };

  const getSignedVideoUrl = async (url: string): Promise<string> => {
    if (!url) return '';
    // YouTube links — return as-is
    if (url.includes('youtube.com') || url.includes('youtu.be')) return url;

    try {
      // Determine the file path:
      // New records store just the filename: "abc-123.mp4"
      // Old records may store the full public URL: "https://.../story-videos/abc-123.mp4"
      let filePath = url;
      const match = url.match(/\/storage\/v1\/object\/(?:public|sign)\/story-videos\/(.+)/);
      if (match) {
        filePath = match[1].split('?')[0]; // strip query params from old full URLs
      }

      const { data, error } = await supabase.storage
        .from('story-videos')
        .createSignedUrl(filePath, 3600); // 1-hour signed URL

      if (!error && data?.signedUrl) return getSafeImageUrl(data.signedUrl);
    } catch (e) {
      console.error('Failed to create signed URL:', e);
    }
    return getSafeImageUrl(url); // fallback

  };

  const handleOpenVoting = async (participant: Participant) => {
    setSelectedParticipant(participant);
    setIsVotingOpen(true);
    setVoteScore([50]);
    setVideoProgress([0]);
    setJudgeComment('');
    setResolvedVideoUrl(''); // reset while loading
    // Resolve the video URL (signed URL for private bucket)
    getSignedVideoUrl(participant.videoUrl).then(setResolvedVideoUrl);
  };

  const handleSubmitVote = async () => {
    if (!user?.id || !selectedParticipant) return;

    const score = Math.round((voteScore[0] / 100) * 10);

    try {
      const { error } = await supabase.from('votes').insert({
        user_id: user.id,
        registration_id: selectedParticipant.registrationId,
        score,
        comment: judgeComment || null
      });

      if (error) throw error;

      toast({
        title: 'Vote Submitted!',
        description: `You gave a score of ${score}/10`
      });

      setIsVotingOpen(false);
      fetchEvents();
    } catch (error: any) {
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

  const isYouTubeUrl = (url: string) => {
    return url.includes('youtube.com') || url.includes('youtu.be');
  };

  const getVideoEmbedUrl = (url: string) => {
    if (!url) return '';
    const ytMatch = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]+)/);
    if (ytMatch) {
      return `https://www.youtube.com/embed/${ytMatch[1]}`;
    }
    return url;
  };

  return (
    <div className="space-y-6 page-enter">
      <h1 className="font-display text-2xl font-bold text-foreground">Event Submissions</h1>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      ) : events.length === 0 ? (
        <div className="bg-card p-6 rounded-2xl border border-border/50 text-center">
          <p className="text-muted-foreground">No events with submissions found.</p>
        </div>
      ) : (
        <div className="grid gap-4">
          {events.map((event) => (
            <div
              key={event.id}
              className="bg-card p-6 rounded-2xl border border-border/50 card-hover"
            >
              <div className="flex justify-between items-center">
                <div>
                  <h3 className="font-display text-lg font-semibold text-foreground">
                    {event.eventName}
                  </h3>
                  <div className="flex items-center gap-3 mt-2">
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {event.participants.length} Participants
                    </Badge>
                    <Badge variant="outline" className="text-yellow-600 border-yellow-600">
                      {event.pendingCount} Pending
                    </Badge>
                    <Badge variant="outline" className="text-green-600 border-green-600">
                      {event.reviewedCount} Reviewed
                    </Badge>
                  </div>
                </div>
                <Button variant="outline" size="sm" onClick={() => handleOpenParticipants(event)}>
                  <Eye className="w-4 h-4 mr-2" />
                  View Participants
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Participants Sheet */}
      <Sheet open={isParticipantsOpen} onOpenChange={setIsParticipantsOpen}>
        <SheetContent side="right" className="bg-background/95 backdrop-blur-lg border-l border-border/60 sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="font-display text-xl">
              {selectedEvent?.eventName}
            </SheetTitle>
            <SheetDescription>
              {selectedEvent?.participants.length} participant(s) in this event
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4 space-y-3">
            {selectedEvent?.participants?.map((participant) => (
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
                      <Badge variant="secondary" className="text-xs bg-green-100 text-green-700 dark:bg-green-800 dark:text-green-200">
                        Voted
                      </Badge>
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
                  onClick={() => handleOpenVoting(participant)}
                  disabled={participant.hasVoted}
                >
                  {participant.hasVoted ? 'Done' : 'Vote'}
                </Button>
              </div>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Voting Panel Dialog */}
      <Dialog open={isVotingOpen} onOpenChange={setIsVotingOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-background/95 backdrop-blur-lg border border-border/60">
          <DialogHeader>
            <DialogTitle className="font-display text-2xl">
              {selectedParticipant?.storyTitle}
            </DialogTitle>
          </DialogHeader>

          {selectedParticipant && (
            <div className="space-y-6 mt-4">
              {/* Video Section */}
              <div className="relative w-full bg-black rounded-xl overflow-hidden aspect-video">
                {resolvedVideoUrl ? (
                  isYouTubeUrl(resolvedVideoUrl) ? (
                    <iframe
                      src={getVideoEmbedUrl(resolvedVideoUrl)}
                      className="w-full h-full"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                    />
                  ) : (
                    <video
                      ref={videoRef}
                      src={resolvedVideoUrl}
                      className="w-full h-full object-contain bg-black"
                      controls
                      controlsList="nodownload"
                      playsInline
                    />
                  )
                ) : selectedParticipant?.videoUrl ? (
                  <div className="w-full h-full flex items-center justify-center text-muted-foreground">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
                  </div>
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

              {/* Story Description */}
              <div className="p-4 rounded-xl bg-muted/40 border border-border/60">
                <h4 className="font-medium text-foreground mb-2">Story Description</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {selectedParticipant.storyDescription || 'No description provided.'}
                </p>
              </div>

              {/* Judge Comment */}
              <div className="space-y-3 p-4 rounded-xl bg-muted/40 border border-border/60">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-5 h-5 text-primary" />
                  <h4 className="font-medium text-foreground">Your Review Comment</h4>
                </div>
                <Textarea
                  placeholder="Add your feedback or review comments here (optional)..."
                  value={judgeComment}
                  onChange={(e) => setJudgeComment(e.target.value)}
                  className="min-h-[100px] resize-none"
                />
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

export default JudgeSubmissions;
