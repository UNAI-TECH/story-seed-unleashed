import { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Save, Loader2, Bell } from 'lucide-react';
import { supabase, getSafeImageUrl } from '@/integrations/supabase/client';

import { useToast } from '@/hooks/use-toast';

interface ProfileData {
  name: string | null;
  phone: string | null;
  city: string | null;
}

interface JudgeSettingsData {
  review_reminders: boolean;
  expertise: string | null;
  bio: string | null;
}

const JudgeProfile = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [profile, setProfile] = useState<ProfileData>({ name: '', phone: '', city: '' });
  const [settings, setSettings] = useState<JudgeSettingsData>({
    review_reminders: true,
    expertise: '',
    bio: '',
  });

  useEffect(() => {
    const fetchData = async () => {
      if (!user?.id) return;

      // Fetch profile
      const { data: profileData } = await supabase
        .from('profiles')
        .select('name, phone, city')
        .eq('id', user.id)
        .single();

      if (profileData) {
        setProfile({
          name: profileData.name || '',
          phone: profileData.phone || '',
          city: profileData.city || '',
        });
      }

      // Fetch judge settings
      const { data: settingsData } = await supabase
        .from('judge_settings')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (settingsData) {
        setSettings({
          review_reminders: settingsData.review_reminders ?? true,
          expertise: settingsData.expertise || '',
          bio: settingsData.bio || '',
        });
      }

      setIsLoading(false);
    };

    fetchData();
  }, [user?.id]);

  const handleSave = async () => {
    if (!user?.id) return;

    setIsSaving(true);

    try {
      // Update profile
      await supabase
        .from('profiles')
        .update({ name: profile.name, phone: profile.phone, city: profile.city })
        .eq('id', user.id);

      // Upsert judge settings
      await supabase
        .from('judge_settings')
        .upsert({
          user_id: user.id,
          ...settings,
        }, { onConflict: 'user_id' });

      toast({ title: 'Profile Updated', description: 'Your profile has been saved successfully.' });
    } catch (error) {
      console.error('Error saving profile:', error);
      toast({ title: 'Error', description: 'Failed to save profile.', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6 page-enter max-w-2xl">
      <h1 className="font-display text-2xl font-bold text-foreground">Judge Profile</h1>

      <div className="bg-card p-6 rounded-2xl border border-border/50 space-y-6">
        <div className="flex items-center gap-4">
          <img
            src={getSafeImageUrl(user?.avatar || `https://api.dicebear.com/7.x/avataaars/svg?seed=${user?.id}`)}
            alt={user?.name}
            className="w-20 h-20 rounded-full object-cover border-4 border-secondary/20"
          />

          <div>
            <h2 className="font-display text-xl font-semibold text-foreground">{profile.name || user?.name}</h2>
            <p className="text-secondary font-medium">Judge</p>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
        </div>

        <div className="grid gap-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Full Name</label>
              <Input
                value={profile.name || ''}
                onChange={(e) => setProfile(prev => ({ ...prev, name: e.target.value }))}
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
                onChange={(e) => setProfile(prev => ({ ...prev, phone: e.target.value }))}
                placeholder="+91 98765 43210"
              />
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">City</label>
              <Input
                value={profile.city || ''}
                onChange={(e) => setProfile(prev => ({ ...prev, city: e.target.value }))}
                placeholder="Mumbai"
              />
            </div>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Expertise</label>
            <Input
              value={settings.expertise || ''}
              onChange={(e) => setSettings(prev => ({ ...prev, expertise: e.target.value }))}
              placeholder="Children's Literature, Fantasy, Creative Writing"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Bio</label>
            <Textarea
              value={settings.bio || ''}
              onChange={(e) => setSettings(prev => ({ ...prev, bio: e.target.value }))}
              placeholder="A short bio about yourself..."
              rows={3}
            />
          </div>
        </div>
      </div>

      {/* Notification Settings */}
      <div className="bg-card p-6 rounded-2xl border border-border/50 space-y-4">
        <div className="flex items-center gap-3">
          <Bell className="w-5 h-5 text-primary" />
          <h3 className="font-display text-lg font-semibold">Notification Settings</h3>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4 border border-border/40 rounded-xl p-4">
            <div>
              <p className="font-medium text-foreground">Review Reminders</p>
              <p className="text-sm text-muted-foreground">Get reminded about pending reviews</p>
            </div>
            <Switch
              checked={settings.review_reminders}
              onCheckedChange={(checked) => setSettings(prev => ({ ...prev, review_reminders: checked }))}
            />
          </div>
        </div>
      </div>

      <Button variant="hero" className="w-fit" onClick={handleSave} disabled={isSaving}>
        {isSaving ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
        Save Changes
      </Button>
    </div>
  );
};

export default JudgeProfile;
