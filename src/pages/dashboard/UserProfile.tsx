import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Save, Loader2 } from 'lucide-react';
import { Textarea } from '@/components/ui/textarea';
import { supabase, getSafeImageUrl } from '@/integrations/supabase/client';

import { useToast } from '@/hooks/use-toast';

interface ProfileData {
  name: string | null;
  avatar: string | null;
  phone: string | null;
  city: string | null;
  institution: string | null;
  grade: string | null;
  bio: string | null;
  guardian_name: string | null;
  guardian_contact: string | null;
}

const UserProfile = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profile, setProfile] = useState<ProfileData>({
    name: '',
    avatar: '',
    phone: '',
    city: '',
    institution: '',
    grade: '',
    bio: '',
    guardian_name: '',
    guardian_contact: '',
  });

  useEffect(() => {
    if (!user?.id) return;

    const fetchProfile = async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();

      if (!error && data) {
        setProfile({
          name: data.name || '',
          avatar: data.avatar || '',
          phone: (data as any).phone || '',
          city: (data as any).city || '',
          institution: (data as any).institution || '',
          grade: (data as any).grade || '',
          bio: (data as any).bio || '',
          guardian_name: (data as any).guardian_name || '',
          guardian_contact: (data as any).guardian_contact || '',
        });
      }
      setIsLoading(false);
    };

    fetchProfile();

    // Set up real-time subscription
    const channel = supabase
      .channel('profile-changes')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'profiles',
          filter: `id=eq.${user.id}`,
        },
        (payload) => {
          const newData = payload.new as any;
          setProfile({
            name: newData.name || '',
            avatar: newData.avatar || '',
            phone: newData.phone || '',
            city: newData.city || '',
            institution: newData.institution || '',
            grade: newData.grade || '',
            bio: newData.bio || '',
            guardian_name: newData.guardian_name || '',
            guardian_contact: newData.guardian_contact || '',
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id]);

  const handleSave = async () => {
    if (!user?.id) return;
    setIsSaving(true);

    const { error } = await supabase
      .from('profiles')
      .update({
        name: profile.name,
        phone: profile.phone,
        city: profile.city,
        institution: profile.institution,
        grade: profile.grade,
        bio: profile.bio,
        guardian_name: profile.guardian_name,
        guardian_contact: profile.guardian_contact,
      } as any)
      .eq('id', user.id);

    if (error) {
      toast({
        title: 'Error',
        description: 'Failed to update profile',
        variant: 'destructive',
      });
    } else {
      toast({
        title: 'Success',
        description: 'Profile updated successfully',
      });
    }

    setIsSaving(false);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 page-enter flex flex-col items-center">
      <h1 className="w-full max-w-3xl font-display text-2xl font-bold text-foreground">
        My Profile
      </h1>
      <div className="w-full max-w-3xl bg-card p-6 rounded-2xl border border-border/50 shadow-sm">
        <div className="flex items-center gap-4 mb-6">
          <img
            src={getSafeImageUrl(profile.avatar || user?.avatar)}
            alt={profile.name || user?.name}
            className="w-20 h-20 rounded-full object-cover border-4 border-primary/20"
          />

          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">
              {profile.name || user?.name}
            </h2>
            <p className="text-muted-foreground">{user?.email}</p>
            {user?.id && (
              <p className="text-xs text-muted-foreground mt-1">
                User ID:{' '}
                <span className="font-mono font-semibold text-foreground">{user.id}</span>
              </p>
            )}
          </div>
        </div>
        <div className="grid gap-5">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Full Name</label>
              <Input
                value={profile.name || ''}
                onChange={(e) => setProfile({ ...profile, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Email</label>
              <Input value={user?.email || ''} type="email" disabled />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Phone</label>
              <Input
                value={profile.phone || ''}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                placeholder="+91 98765 43210"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">City</label>
              <Input
                value={profile.city || ''}
                onChange={(e) => setProfile({ ...profile, city: e.target.value })}
                placeholder="Mumbai"
              />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Institution Name</label>
              <Input
                value={profile.institution || ''}
                onChange={(e) => setProfile({ ...profile, institution: e.target.value })}
                placeholder="Enter your school / institution name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Grade / Class</label>
              <Input
                value={profile.grade || ''}
                onChange={(e) => setProfile({ ...profile, grade: e.target.value })}
                placeholder="e.g. Grade 8, Class B"
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Bio</label>
              <span className="text-[11px] text-muted-foreground">
                Max 250 characters
              </span>
            </div>
            <Textarea
              rows={4}
              maxLength={250}
              value={profile.bio || ''}
              onChange={(e) => setProfile({ ...profile, bio: e.target.value })}
              placeholder="Tell us a little about yourself as a storyteller..."
            />
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Guardian Name</label>
              <Input
                value={profile.guardian_name || ''}
                onChange={(e) => setProfile({ ...profile, guardian_name: e.target.value })}
                placeholder="Parent / guardian full name"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Guardian Contact</label>
              <Input
                value={profile.guardian_contact || ''}
                onChange={(e) => setProfile({ ...profile, guardian_contact: e.target.value })}
                placeholder="+91 ...."
              />
            </div>
          </div>
          <Button variant="hero" className="w-fit" onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save Changes
          </Button>
        </div>
      </div>
    </div>
  );
};

export default UserProfile;