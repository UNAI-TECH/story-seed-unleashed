import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Calendar,
  MapPin,
  Clock,
  ArrowLeft,
  Share2,
  Trophy,
  Copy,
  MessageCircle,
  Mail,
  Send,
  Facebook,
  Twitter,
  Linkedin,
  Loader2,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase, getSafeImageUrl } from '@/integrations/supabase/client';
import { format } from 'date-fns';


interface EventData {
  id: string;
  name: string;
  description: string | null;
  banner_image: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: boolean | null;
}

const UserEventDetails = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [event, setEvent] = useState<EventData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [participantCount, setParticipantCount] = useState(0);
  const [newComment, setNewComment] = useState('');
  const [comments, setComments] = useState<string[]>([]);
  const [isShareOpen, setIsShareOpen] = useState(false);

  useEffect(() => {
    const fetchEvent = async () => {
      if (!id) return;

      setIsLoading(true);

      const { data: eventData, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', id)
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        console.error('Error fetching event:', error);
        navigate('/user/dashboard/events', { replace: true });
        return;
      }

      if (!eventData) {
        console.log('Event not found or not active');
        navigate('/user/dashboard/events', { replace: true });
        return;
      }

      setEvent(eventData);

      // Fetch participant count
      const { count } = await supabase
        .from('registrations')
        .select('*', { count: 'exact', head: true })
        .eq('event_id', id);

      setParticipantCount(count || 0);
      setIsLoading(false);
    };

    fetchEvent();

    // Real-time subscription
    const channel = supabase
      .channel(`event-${id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events', filter: `id=eq.${id}` }, () => fetchEvent())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'registrations', filter: `event_id=eq.${id}` }, () => fetchEvent())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [id, navigate]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!event) {
    return null;
  }

  const today = new Date();
  const eventEndDate = event.end_date ? new Date(event.end_date) : null;
  const hasEnded = eventEndDate ? today > eventEndDate : false;

  const handleAddComment = () => {
    const value = newComment.trim();
    if (!value) return;
    setComments((prev) => [value, ...prev]);
    setNewComment('');
  };

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/user/dashboard/events/${event.id}`
    : `/user/dashboard/events/${event.id}`;

  const handleShareClick = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: event.name,
          text: `Check out this event on Story Seed: ${event.name}`,
          url: shareUrl,
        });
        return;
      } catch {
        // if user cancels, just ignore
      }
    }
    setIsShareOpen(true);
  };

  const formatDateRange = () => {
    if (event.start_date && event.end_date) {
      return `${format(new Date(event.start_date), 'MMM d')} - ${format(new Date(event.end_date), 'MMM d, yyyy')}`;
    }
    if (event.start_date) {
      return format(new Date(event.start_date), 'MMM d, yyyy');
    }
    return 'Date TBA';
  };

  return (
    <div className="space-y-6 page-enter">
      {/* Top bar with back + status */}
      <div className="flex items-center gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 px-2"
          onClick={() => navigate(-1)}
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="hidden sm:inline">Back</span>
        </Button>
        <span
          className={`px-3 py-1 rounded-full text-xs font-semibold ${hasEnded
              ? 'bg-destructive text-destructive-foreground'
              : 'bg-green-100 text-green-700'
            }`}
        >
          {hasEnded ? 'Event ended' : event.is_active ? 'Active event' : 'Upcoming event'}
        </span>
      </div>

      {/* Banner */}
      <div className="overflow-hidden rounded-2xl border border-border/60">
        <img
          src={getSafeImageUrl(event.banner_image) || 'https://images.unsplash.com/photo-1483721310020-03333e577078?w=1200&auto=format&fit=crop&q=80'}
          alt={event.name}
          className="w-full max-h-[260px] object-cover"
        />

      </div>

      {/* Main details header */}
      <div className="space-y-3">
        <div>
          <h1 className="font-display text-2xl md:text-3xl font-bold text-foreground">
            {event.name}
          </h1>
          <p className="text-sm text-muted-foreground">
            Event by <span className="font-semibold">Story Seed Studio</span>
          </p>
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-foreground">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4" />
            <span>{formatDateRange()}</span>
          </div>
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            <span>{participantCount} participants</span>
          </div>
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4" />
            <span>Online</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant={hasEnded ? 'outline' : 'hero'}
            className="min-w-[160px]"
            disabled={hasEnded}
            onClick={() => navigate('/register')}
          >
            {hasEnded ? 'Event ended' : 'Register Now'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="gap-2 text-muted-foreground"
            onClick={handleShareClick}
          >
            <Share2 className="w-4 h-4" />
            Share
          </Button>
        </div>
      </div>

      {/* Tabs: Details / Comments / Rules */}
      <Tabs defaultValue="details" className="w-full">
        <TabsList className="w-full max-w-md grid grid-cols-3 mb-4 bg-destructive/10 text-destructive">
          <TabsTrigger
            value="details"
            className="data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground"
          >
            Details
          </TabsTrigger>
          <TabsTrigger
            value="comments"
            className="data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground"
          >
            Comments
          </TabsTrigger>
          <TabsTrigger
            value="rules"
            className="data-[state=active]:bg-destructive data-[state=active]:text-destructive-foreground"
          >
            Rules
          </TabsTrigger>
        </TabsList>

        <TabsContent value="details" className="space-y-4">
          <div className="space-y-2">
            <h2 className="font-display text-xl font-semibold text-foreground">About</h2>
            <p className="text-sm leading-relaxed text-foreground">
              {event.description || 'No description available for this event.'}
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-display text-lg font-semibold text-foreground">Schedule</h3>
            <p className="text-sm text-foreground">
              Event period: <span className="font-medium">{formatDateRange()}</span>
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-display text-lg font-semibold text-foreground flex items-center gap-2">
              <Trophy className="w-4 h-4 text-secondary" />
              Prizes & Recognition
            </h3>
            <p className="text-sm text-foreground">
              Prizes, certificates for all finalists, and a special feature on the Story Seed spotlight page.
            </p>
          </div>
        </TabsContent>

        <TabsContent value="comments" className="space-y-4">
          <div className="space-y-2">
            <h2 className="font-display text-xl font-semibold text-foreground">Comments</h2>
            <p className="text-xs text-muted-foreground">
              Ask questions about the event. Organisers can use this space to reply.
            </p>
          </div>

          <div className="space-y-2">
            <textarea
              rows={3}
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              placeholder="Write a comment or question..."
              className="w-full text-sm rounded-lg border border-border bg-background px-3 py-2 resize-none focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <div className="flex justify-end">
              <Button size="sm" onClick={handleAddComment}>
                Post comment
              </Button>
            </div>
          </div>

          <div className="space-y-3">
            {comments.map((comment, idx) => (
              <div
                key={`${comment}-${idx}`}
                className="rounded-xl border border-border/60 bg-card px-3 py-2 text-sm"
              >
                <p className="text-foreground">{comment}</p>
              </div>
            ))}
            {comments.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No comments yet. Be the first to ask something about this event.
              </p>
            )}
          </div>
        </TabsContent>

        <TabsContent value="rules" className="space-y-4">
          <div className="space-y-2">
            <h2 className="font-display text-xl font-semibold text-foreground">Rules & Regulations</h2>
            <p className="text-xs text-muted-foreground">
              Please read these carefully before submitting your story.
            </p>
          </div>

          <ul className="list-disc list-inside text-sm text-foreground space-y-1">
            <li>Each story video must be between 60 and 120 seconds.</li>
            <li>Original content only – no plagiarism or copyrighted background music.</li>
            <li>Respectful language and family-friendly content are mandatory.</li>
            <li>One submission per registered participant for this event.</li>
          </ul>
        </TabsContent>
      </Tabs>

      {/* Share dialog */}
      <Dialog open={isShareOpen} onOpenChange={setIsShareOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Share this event</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 text-sm">
            <div>
              <p className="text-xs text-muted-foreground mb-1">Event link</p>
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={shareUrl}
                  className="flex-1 rounded-md border border-border bg-muted px-2 py-1 text-xs text-foreground"
                  onFocus={(e) => e.target.select()}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-1"
                  onClick={() => navigator.clipboard?.writeText(shareUrl)}
                >
                  <Copy className="w-4 h-4" />
                  Copy
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mt-2">
              <Button
                type="button"
                variant="outline"
                className="justify-start gap-2"
                onClick={() => {
                  window.open(
                    `https://wa.me/?text=${encodeURIComponent(`Check out this event: ${event.name} - ${shareUrl}`)}`,
                    '_blank',
                  );
                }}
              >
                <MessageCircle className="w-4 h-4" />
                WhatsApp
              </Button>
              <Button
                type="button"
                variant="outline"
                className="justify-start gap-2"
                onClick={() => {
                  window.open(
                    `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(event.name)}&body=${encodeURIComponent(`Hi,\n\nI thought you might like this event: ${event.name}.\n\nYou can view it here: ${shareUrl}`)}`,
                    '_blank',
                  );
                }}
              >
                <Mail className="w-4 h-4" />
                Gmail
              </Button>
              <Button
                type="button"
                variant="outline"
                className="justify-start gap-2"
                onClick={() => {
                  window.open(
                    `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(shareUrl)}`,
                    '_blank',
                  );
                }}
              >
                <Facebook className="w-4 h-4" />
                Facebook
              </Button>
              <Button
                type="button"
                variant="outline"
                className="justify-start gap-2"
                onClick={() => {
                  window.open(
                    `https://t.me/share/url?url=${encodeURIComponent(shareUrl)}&text=${encodeURIComponent(event.name)}`,
                    '_blank',
                  );
                }}
              >
                <Send className="w-4 h-4" />
                Telegram
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default UserEventDetails;
