import { useState, useEffect } from 'react';
import { Trash2, Video, Trophy, AlertTriangle, CheckCircle, Eye, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { supabase, getSafeImageUrl } from '@/integrations/supabase/client';

import { useToast } from '@/hooks/use-toast';

interface Event {
  id: string;
  name: string;
}

interface ParticipantWithScore {
  id: string;
  first_name: string;
  last_name: string;
  story_title: string;
  class_level: string | null;
  yt_link: string | null;
  overall_votes: number;
  averageJudgeScore: number;
  totalJudgeReviews: number;
  isTop6: boolean;
  isTop45: boolean;
  rank: number;
}

const AdminVideoManagement = () => {
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>('');
  const [participants, setParticipants] = useState<ParticipantWithScore[]>([]);
  const [loading, setLoading] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [stats, setStats] = useState({ total: 0, top6: 0, top45: 0, toDelete: 0 });
  const { toast } = useToast();

  // Fetch events
  useEffect(() => {
    const fetchEvents = async () => {
      const { data, error } = await supabase
        .from('events')
        .select('id, name')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (!error && data) {
        setEvents(data);
      }
    };
    fetchEvents();
  }, []);

  // Fetch participants with judge scores
  const fetchParticipants = async (eventId: string) => {
    setLoading(true);
    try {
      // Fetch registrations
      const { data: registrations, error: regError } = await supabase
        .from('registrations')
        .select('id, first_name, last_name, story_title, class_level, yt_link, overall_votes')
        .eq('event_id', eventId);

      if (regError) throw regError;

      // Fetch all votes
      const { data: votes } = await supabase
        .from('votes')
        .select('registration_id, user_id, score');

      // Fetch judge user IDs
      const { data: userRoles } = await supabase
        .from('user_roles')
        .select('user_id, role');

      const judgeUserIds = new Set(
        (userRoles || [])
          .filter(ur => ur.role === 'judge')
          .map(ur => ur.user_id)
      );

      // Calculate judge scores for each participant
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

      // Create participant list with scores
      const participantsWithScores = (registrations || []).map(reg => ({
        id: reg.id,
        first_name: reg.first_name,
        last_name: reg.last_name,
        story_title: reg.story_title,
        class_level: reg.class_level,
        yt_link: reg.yt_link,
        overall_votes: reg.overall_votes || 0,
        averageJudgeScore: scoreData[reg.id] ? scoreData[reg.id].total / scoreData[reg.id].count : 0,
        totalJudgeReviews: scoreData[reg.id]?.count || 0,
        isTop6: false,
        isTop45: false,
        rank: 0,
      }));

      // Sort by average judge score
      participantsWithScores.sort((a, b) => b.averageJudgeScore - a.averageJudgeScore);

      // Determine top 6 (balanced by class level)
      const classLevels = ['Tiny Tales', 'Young Dreamers', 'Story Champions'];
      const top6Ids = new Set<string>();

      for (const level of classLevels) {
        const entriesForLevel = participantsWithScores.filter(
          p => p.class_level === level && p.totalJudgeReviews > 0
        );
        entriesForLevel.slice(0, 2).forEach(p => top6Ids.add(p.id));
      }

      // Fill remaining top 6 if needed
      if (top6Ids.size < 6) {
        const remaining = participantsWithScores.filter(
          p => !top6Ids.has(p.id) && p.totalJudgeReviews > 0
        );
        remaining.slice(0, 6 - top6Ids.size).forEach(p => top6Ids.add(p.id));
      }

      // Determine top 45 (excluding top 6)
      const reviewedParticipants = participantsWithScores.filter(
        p => p.totalJudgeReviews > 0 && !top6Ids.has(p.id)
      );
      const top45Ids = new Set(reviewedParticipants.slice(0, 45).map(p => p.id));

      // Update flags and ranks
      let rank = 1;
      participantsWithScores.forEach(p => {
        p.isTop6 = top6Ids.has(p.id);
        p.isTop45 = top45Ids.has(p.id);
        if (p.totalJudgeReviews > 0) {
          p.rank = rank++;
        }
      });

      setParticipants(participantsWithScores);
      setStats({
        total: participantsWithScores.length,
        top6: top6Ids.size,
        top45: top45Ids.size,
        toDelete: participantsWithScores.filter(p => !top6Ids.has(p.id) && !top45Ids.has(p.id) && p.yt_link).length,
      });
    } catch (error) {
      console.error('Error fetching participants:', error);
      toast({ title: 'Error', description: 'Failed to fetch participants', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  // Handle event selection
  const handleEventChange = (eventId: string) => {
    setSelectedEventId(eventId);
    if (eventId) {
      fetchParticipants(eventId);
    } else {
      setParticipants([]);
      setStats({ total: 0, top6: 0, top45: 0, toDelete: 0 });
    }
  };

  // Delete non-top 45 videos
  const handleDeleteNonTop45Videos = async () => {
    if (!selectedEventId) return;

    setDeleting(true);
    try {
      const toDelete = participants.filter(
        p => !p.isTop6 && !p.isTop45 && p.yt_link
      );

      let deletedCount = 0;
      let errorCount = 0;

      for (const participant of toDelete) {
        if (!participant.yt_link) continue;

        // Extract filename from URL
        const url = participant.yt_link;
        const fileName = url.split('/').pop();

        if (fileName && url.includes('story-videos')) {
          // Delete from storage
          const { error: storageError } = await supabase.storage
            .from('story-videos')
            .remove([fileName]);

          if (storageError) {
            console.error('Storage delete error:', storageError);
            errorCount++;
            continue;
          }

          // Clear yt_link in database
          const { error: dbError } = await supabase
            .from('registrations')
            .update({ yt_link: null })
            .eq('id', participant.id);

          if (dbError) {
            console.error('DB update error:', dbError);
            errorCount++;
          } else {
            deletedCount++;
          }
        }
      }

      toast({
        title: 'Videos Deleted',
        description: `Successfully deleted ${deletedCount} videos. ${errorCount > 0 ? `${errorCount} errors occurred.` : ''}`,
      });

      setDeleteDialogOpen(false);
      fetchParticipants(selectedEventId);
    } catch (error) {
      console.error('Delete error:', error);
      toast({ title: 'Error', description: 'Failed to delete videos', variant: 'destructive' });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 page-enter">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-foreground">Video Management</h1>
      </div>

      {/* Event Selection */}
      <div className="bg-card p-6 rounded-2xl border border-border/50">
        <label className="text-sm font-medium text-foreground mb-2 block">Select Event</label>
        <Select value={selectedEventId} onValueChange={handleEventChange}>
          <SelectTrigger className="w-full max-w-md">
            <SelectValue placeholder="Choose an event to manage videos" />
          </SelectTrigger>
          <SelectContent>
            {events.map(event => (
              <SelectItem key={event.id} value={event.id}>
                {event.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Stats */}
      {selectedEventId && !loading && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-card p-4 rounded-xl border border-border/50">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Users className="w-4 h-4" />
              <span className="text-sm">Total Participants</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.total}</p>
          </div>
          <div className="bg-card p-4 rounded-xl border border-border/50">
            <div className="flex items-center gap-2 text-yellow-600 mb-1">
              <Trophy className="w-4 h-4" />
              <span className="text-sm">Top 6 Winners</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.top6}</p>
          </div>
          <div className="bg-card p-4 rounded-xl border border-border/50">
            <div className="flex items-center gap-2 text-green-600 mb-1">
              <CheckCircle className="w-4 h-4" />
              <span className="text-sm">Top 45 for Voting</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.top45}</p>
          </div>
          <div className="bg-card p-4 rounded-xl border border-border/50">
            <div className="flex items-center gap-2 text-red-600 mb-1">
              <Trash2 className="w-4 h-4" />
              <span className="text-sm">Videos to Delete</span>
            </div>
            <p className="text-2xl font-bold text-foreground">{stats.toDelete}</p>
          </div>
        </div>
      )}

      {/* Delete Button */}
      {selectedEventId && !loading && stats.toDelete > 0 && (
        <div className="bg-destructive/10 p-4 rounded-xl border border-destructive/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-destructive" />
            <div>
              <p className="font-medium text-foreground">Ready to clean up?</p>
              <p className="text-sm text-muted-foreground">
                {stats.toDelete} videos from participants outside top 45 can be deleted to save storage space.
              </p>
            </div>
          </div>
          <Button variant="destructive" onClick={() => setDeleteDialogOpen(true)}>
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Non-Top 45 Videos
          </Button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        </div>
      )}

      {/* Participants Table */}
      {selectedEventId && !loading && participants.length > 0 && (
        <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-4 font-medium text-foreground">Rank</th>
                  <th className="text-left p-4 font-medium text-foreground">Participant</th>
                  <th className="text-left p-4 font-medium text-foreground">Story</th>
                  <th className="text-left p-4 font-medium text-foreground">Class Level</th>
                  <th className="text-left p-4 font-medium text-foreground">Judge Score</th>
                  <th className="text-left p-4 font-medium text-foreground">Status</th>
                  <th className="text-left p-4 font-medium text-foreground">Video</th>
                </tr>
              </thead>
              <tbody>
                {participants.map((participant) => (
                  <tr
                    key={participant.id}
                    className={`border-t border-border/50 ${participant.isTop6
                        ? 'bg-yellow-50 dark:bg-yellow-900/10'
                        : participant.isTop45
                          ? 'bg-green-50 dark:bg-green-900/10'
                          : ''
                      }`}
                  >
                    <td className="p-4">
                      {participant.rank > 0 ? (
                        <span className="font-bold text-foreground">#{participant.rank}</span>
                      ) : (
                        <span className="text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="p-4">
                      <p className="font-medium text-foreground">
                        {participant.first_name} {participant.last_name}
                      </p>
                    </td>
                    <td className="p-4">
                      <p className="text-sm text-muted-foreground truncate max-w-[200px]">
                        {participant.story_title}
                      </p>
                    </td>
                    <td className="p-4">
                      <span className="text-sm text-muted-foreground">
                        {participant.class_level || '-'}
                      </span>
                    </td>
                    <td className="p-4">
                      {participant.totalJudgeReviews > 0 ? (
                        <div>
                          <span className="font-medium text-foreground">
                            {participant.averageJudgeScore.toFixed(1)}/10
                          </span>
                          <span className="text-xs text-muted-foreground ml-1">
                            ({participant.totalJudgeReviews} reviews)
                          </span>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">Not reviewed</span>
                      )}
                    </td>
                    <td className="p-4">
                      {participant.isTop6 ? (
                        <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-800 dark:text-yellow-100">
                          <Trophy className="w-3 h-3 mr-1" />
                          Top 6
                        </Badge>
                      ) : participant.isTop45 ? (
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-800 dark:text-green-100">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Top 45
                        </Badge>
                      ) : participant.totalJudgeReviews > 0 ? (
                        <Badge variant="outline" className="text-red-600 border-red-600">
                          Outside Top 45
                        </Badge>
                      ) : (
                        <Badge variant="outline">Pending Review</Badge>
                      )}
                    </td>
                    <td className="p-4">
                      {participant.yt_link ? (
                        <a
                          href={getSafeImageUrl(participant.yt_link)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-primary hover:underline"
                        >

                          <Video className="w-4 h-4" />
                          <span className="text-sm">View</span>
                        </a>
                      ) : (
                        <span className="text-muted-foreground text-sm">No video</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Confirm Video Deletion
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-muted-foreground">
              You are about to permanently delete <strong>{stats.toDelete}</strong> videos from participants
              who are outside the top 45 rankings.
            </p>
            <p className="text-sm text-destructive font-medium">
              This action cannot be undone. The videos will be removed from storage.
            </p>
            <div className="flex gap-2 justify-end">
              <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleDeleteNonTop45Videos} disabled={deleting}>
                {deleting ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                    Deleting...
                  </>
                ) : (
                  <>
                    <Trash2 className="w-4 h-4 mr-1" />
                    Delete Videos
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminVideoManagement;
