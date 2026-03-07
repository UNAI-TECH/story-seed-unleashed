import { useState, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Check, User, FileText, ArrowRight, ArrowLeft, Loader2, Calendar, Mail, ShieldCheck, CreditCard, Scan, Wallet, FileType, GraduationCap, School, Video, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { supabase, getSafeImageUrl } from '@/integrations/supabase/client';

import { format } from 'date-fns';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface Event {
  id: string;
  name: string;
  description: string | null;
  is_payment_enabled: boolean;
  event_type: 'school' | 'college' | 'both' | null;
  registration_open: boolean;
  registration_start_date: string | null;
  registration_deadline: string | null;
  payment_deadline: string | null;
  registration_fee: number | null;
  submission_mode: 'individual' | 'institutional' | null;
}

const steps = [
  { id: 1, title: 'Verification', icon: ShieldCheck },
  { id: 2, title: 'Unique Key', icon: ShieldCheck },
  { id: 3, title: 'Select Role', icon: School },
  { id: 4, title: 'Story Details', icon: FileText },
  { id: 5, title: 'Review & Submit', icon: Check },
];

const CLG_WEBHOOK_URL = 'https://kamalesh-tech-aiii.app.n8n.cloud/webhook/clg_registration';

const saveUserSession = (email: string, firstName: string, userId: string): void => {
  localStorage.setItem('story_seed_user_email', email);
  localStorage.setItem('story_seed_user_name', firstName);
  localStorage.setItem('story_seed_user_id', userId);
  let sessionId = localStorage.getItem('story_seed_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('story_seed_session_id', sessionId);
  }
};

const getSessionId = (): string => {
  let sessionId = localStorage.getItem('story_seed_session_id');
  if (!sessionId) {
    sessionId = crypto.randomUUID();
    localStorage.setItem('story_seed_session_id', sessionId);
  }
  return sessionId;
};

const Register = () => {
  const [searchParams] = useSearchParams();
  const eventIdFromUrl = searchParams.get('eventId');
  const isFreeFromUrl = searchParams.get('isFree') === 'true';

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [isComplete, setIsComplete] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [events, setEvents] = useState<Event[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string>(eventIdFromUrl || '');
  const [isEventLocked, setIsEventLocked] = useState(!!eventIdFromUrl);

  const selectedEvent = events.find(e => e.id === selectedEventId);
  const isFree = isFreeFromUrl || (selectedEvent ? (
    selectedEvent.is_payment_enabled === false ||
    !selectedEvent.registration_fee ||
    Number(selectedEvent.registration_fee) <= 0
  ) : false);

  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'initializing' | 'uploading' | 'processing' | 'complete' | 'error'>('idle');
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { toast } = useToast();
  const navigate = useNavigate();

  const [role, setRole] = useState<'school' | 'college' | null>(() => {
    const savedRole = localStorage.getItem('story_seed_user_role');
    return (savedRole as 'school' | 'college') || null;
  });

  useEffect(() => {
    if (role) {
      localStorage.setItem('story_seed_user_role', role);
    }
  }, [role]);

  const [verificationEmail, setVerificationEmail] = useState('');
  const [emailStep, setEmailStep] = useState<'pending' | 'verified'>('pending');
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [uniqueKey, setUniqueKey] = useState(searchParams.get('key') || '');
  const [isKeyVerified, setIsKeyVerified] = useState(false);
  const [authenticatedUserId, setAuthenticatedUserId] = useState<string | null>(null);

  const [personalInfo, setPersonalInfo] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    age: '',
    city: '',
    schoolName: '',
    collegeName: '',
    degree: '',
    branch: '',
  });

  const [storyDetails, setStoryDetails] = useState<{
    title: string;
    category: string;
    classLevel: string;
    description: string;
    guardianName: string;
    guardianPhone: string;
    videoFile: File | null;
    storyPdf: File | null;
  }>({
    title: '',
    category: '',
    classLevel: '',
    description: '',
    guardianName: '',
    guardianPhone: '',
    videoFile: null,
    storyPdf: null,
  });

  useEffect(() => {
    const fetchData = async () => {
      const { data: eventsData, error: eventsError } = await supabase
        .from('events')
        .select(`
          id, name, description, is_payment_enabled, 
          event_type, registration_open, registration_start_date, 
          registration_deadline, payment_deadline, registration_fee,
          submission_mode
        `)
        .eq('is_active', true);

      if (!eventsError && eventsData) {
        setEvents(eventsData as unknown as Event[]);
      }
    };
    fetchData();
  }, []);

  useEffect(() => {
    if (eventIdFromUrl && events.length > 0) {
      const event = events.find(e => e.id === eventIdFromUrl);
      if (event) {
        setSelectedEventId(eventIdFromUrl);
        setIsEventLocked(true);
        if (event.event_type === 'school') setRole('school');
        else if (event.event_type === 'college') setRole('college');
      }
    }
  }, [eventIdFromUrl, events]);

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user && session.user.email) {
        setAuthenticatedUserId(session.user.id);
        setVerificationEmail(session.user.email);
        setEmailStep('verified');
        setPersonalInfo(prev => ({ ...prev, email: session.user.email || '' }));
      }
    };
    checkSession();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' && session?.user?.email) {
        setAuthenticatedUserId(session.user.id);
        setVerificationEmail(session.user.email);
        setEmailStep('verified');
        setPersonalInfo(prev => ({ ...prev, email: session.user.email || '' }));
        toast({ title: 'Signed In!', description: 'Welcome back!', variant: 'success' });
      } else if (event === 'SIGNED_OUT') {
        setVerificationEmail('');
        setEmailStep('pending');
        setCurrentStep(1);
        setAuthenticatedUserId(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (emailStep === 'verified' && currentStep === 1 && selectedEventId && events.length > 0) {
      const event = events.find(e => e.id === selectedEventId);
      const isEventFree = event?.is_payment_enabled === false || !event?.registration_fee || Number(event?.registration_fee) <= 0;

      if (isEventFree) {
        if (role || event?.event_type === 'school' || event?.event_type === 'college') {
          setCurrentStep(4);
        } else {
          setCurrentStep(3);
        }
      } else {
        // For paid events: if we have a key and role, skip to step 4
        if (uniqueKey && role) {
          setCurrentStep(4);
        } else if (uniqueKey) {
          setCurrentStep(3); // Need role if not auto-determined
        } else {
          setCurrentStep(2);
        }
      }
    }
  }, [emailStep, selectedEventId, events, role, currentStep, uniqueKey]);

  useEffect(() => {
    const autoFetchKey = async () => {
      if (authenticatedUserId && selectedEventId && !uniqueKey && currentStep === 2) {
        // Try to fetch from registrations
        const { data: reg } = await supabase
          .from('registrations')
          .select('unique_key, payment_status')
          .eq('user_id', authenticatedUserId)
          .eq('event_id', selectedEventId)
          .eq('payment_status', 'paid')
          .maybeSingle();

        if (reg) {
          setUniqueKey(reg.unique_key);
          setIsKeyVerified(true);
          setRole('school');
          toast({ title: 'Key Found!', description: 'Your paid registration key has been automatically fetched.', variant: 'success' });
          return;
        }

        // Try to fetch from clg_registrations
        const { data: clgReg } = await supabase
          .from('clg_registrations')
          .select('unique_key, payment_status')
          .eq('user_id', authenticatedUserId)
          .eq('event_id', selectedEventId)
          .eq('payment_status', 'paid')
          .maybeSingle();

        if (clgReg) {
          setUniqueKey(clgReg.unique_key);
          setIsKeyVerified(true);
          setRole('college');
          toast({ title: 'Key Found!', description: 'Your paid registration key has been automatically fetched.', variant: 'success' });
        }
      }
    };
    autoFetchKey();
  }, [authenticatedUserId, selectedEventId, currentStep]);

  const validateStep1 = () => {
    if (emailStep !== 'verified') {
      toast({ title: 'Email Required', description: 'Please sign in first.', variant: 'destructive' });
      return false;
    }
    return true;
  };

  const validateStep2 = async () => {
    if (!uniqueKey) {
      if (isFree) {
        const generatedKey = generateUniqueKey();
        setUniqueKey(generatedKey);
        setIsKeyVerified(true);
        return true;
      }
      toast({ title: 'Key Required', description: 'Please enter your unique key/OTP.', variant: 'destructive' });
      return false;
    }

    const { data: reg, error: regError } = await supabase.from('registrations').select('event_id, payment_status').eq('unique_key', uniqueKey.toUpperCase()).maybeSingle();
    const { data: clgReg, error: clgError } = await supabase.from('clg_registrations').select('event_id, payment_status').eq('unique_key', uniqueKey.toUpperCase()).maybeSingle();

    if (regError || clgError) {
      console.error('Key verification error', regError || clgError);
    }

    const existingKey = reg || clgReg;
    if (!existingKey) {
      if (isFree) {
        setIsKeyVerified(true);
        // If they entered a key but it's not found, but it's a free event, we'll still allow it 
        // to collect info, but maybe they typoed. 
        // For now, let's just allow it if it's free.
        return true;
      }
      toast({ title: 'Invalid Key', description: 'This key is invalid.', variant: 'destructive' });
      return false;
    }
    if (existingKey.event_id !== selectedEventId) {
      toast({ title: 'Invalid Event', description: 'This key is for another event.', variant: 'destructive' });
      return false;
    }
    if (existingKey.payment_status !== 'paid') {
      toast({ title: 'Payment Pending', description: 'Your payment is being verified.', variant: 'destructive' });
      return false;
    }

    setIsKeyVerified(true);
    if (clgReg) setRole('college');
    else if (reg) setRole('school');
    return true;
  };

  const validateStep4 = () => {
    const { title, category, classLevel, description, guardianName, guardianPhone } = storyDetails;
    const { firstName, lastName, phone, age, city } = personalInfo;
    const isSchool = role === 'school';

    if (isFree && !uniqueKey) {
      if (!firstName || !lastName || !phone || !age || !city) {
        toast({ title: 'Missing personal details', description: 'Please complete your profile.', variant: 'destructive' });
        return false;
      }
    }

    if (!title || !category || !description) {
      toast({ title: 'Missing details', description: 'Please complete all fields.', variant: 'destructive' });
      return false;
    }

    if (isSchool) {
      if (!classLevel || !guardianName || !guardianPhone) {
        toast({ title: 'Missing school details', description: 'Please complete class and guardian info.', variant: 'destructive' });
        return false;
      }
    }

    return true;
  };

  const uploadVideoToSupabase = async (videoFile: File, registrationId: string) => {
    try {
      setUploadStatus('uploading');
      const MAX_VIDEO_SIZE = 500 * 1024 * 1024; // 500 MB
      if (videoFile.size > MAX_VIDEO_SIZE) {
        toast({ title: 'File Too Large', description: 'Video must be under 500 MB.', variant: 'destructive' });
        setUploadStatus('error');
        return null;
      }
      const fileExt = videoFile.name.split('.').pop() || 'mp4';
      const fileName = `${registrationId}-${Date.now()}.${fileExt}`;
      const { error } = await supabase.storage.from('story-videos').upload(fileName, videoFile);
      if (error) throw error;
      // Store just the file path (not full public URL) so signed URLs can be generated
      await supabase.from('registrations').update({ yt_link: fileName }).eq('id', registrationId);
      setUploadStatus('complete');
      return fileName;
    } catch (error) {
      console.error(error);
      setUploadStatus('error');
      return null;
    }
  };

  const generateUniqueKey = () => {
    return Math.random().toString(36).substring(2, 10).toUpperCase();
  };

  const submitRegistration = async () => {
    setIsSubmitting(true);
    try {
      const tableName = role === 'college' ? 'clg_registrations' : 'registrations';

      const registrationData: any = {
        story_title: storyDetails.title,
        category: storyDetails.category,
        story_description: storyDetails.description,
      };

      if (role === 'school') {
        registrationData.class_level = storyDetails.classLevel;
      }

      let registrationId = '';

      if (uniqueKey) {
        // 1. Check if the key already exists in the database
        const { data: existingRecord } = await supabase
          .from(tableName)
          .select('id')
          .eq('unique_key', uniqueKey.toUpperCase())
          .maybeSingle();

        if (existingRecord) {
          // Update basic details for existing key
          const { error: updateError } = await supabase
            .from(tableName)
            .update(registrationData)
            .eq('unique_key', uniqueKey.toUpperCase());

          if (updateError) throw updateError;
          registrationId = existingRecord.id;
        } else if (isFree) {
          // If key doesn't exist but it's a free event, insert it
          const insertData: any = {
            ...registrationData,
            event_id: selectedEventId,
            user_id: authenticatedUserId,
            first_name: personalInfo.firstName,
            last_name: personalInfo.lastName,
            email: personalInfo.email,
            phone: personalInfo.phone,
            age: parseInt(personalInfo.age),
            city: personalInfo.city,
            payment_status: 'paid', // Free events are always 'paid'
            unique_key: uniqueKey.toUpperCase(),
          };

          if (role === 'college') {
            insertData.college_name = personalInfo.collegeName;
            insertData.degree = personalInfo.degree;
            insertData.branch = personalInfo.branch;
          }

          const { data: record, error: insertError } = await supabase
            .from(tableName)
            .insert(insertData)
            .select('id')
            .maybeSingle();

          if (insertError) throw insertError;
          if (record) registrationId = record.id;
        }
      } else if (isFree) {
        // 2. Insert new record for free event without a key
        const newKey = generateUniqueKey();
        const insertData: any = {
          ...registrationData,
          event_id: selectedEventId,
          user_id: authenticatedUserId,
          first_name: personalInfo.firstName,
          last_name: personalInfo.lastName,
          email: personalInfo.email,
          phone: personalInfo.phone,
          age: parseInt(personalInfo.age),
          city: personalInfo.city,
          payment_status: 'paid', // Free events are always 'paid'
          unique_key: newKey,
        };

        if (role === 'college') {
          insertData.college_name = personalInfo.collegeName;
          insertData.degree = personalInfo.degree;
          insertData.branch = personalInfo.branch;
        }

        const { data: record, error: insertError } = await supabase
          .from(tableName)
          .insert(insertData)
          .select('id')
          .maybeSingle();

        if (insertError) throw insertError;
        if (record) registrationId = record.id;
      }

      if (!registrationId) throw new Error("Could not determine registration ID");

      // 1b. Update profile details for school events (guardian info & grade)
      if (role === 'school' && authenticatedUserId) {
        await supabase
          .from('profiles')
          .update({
            guardian_name: storyDetails.guardianName,
            guardian_contact: storyDetails.guardianPhone,
            grade: storyDetails.classLevel,
          } as any)
          .eq('id', authenticatedUserId);
      }

      // 2. Handle File Uploads
      if (registrationId) {
        if (role === 'school' && storyDetails.videoFile) {
          await uploadVideoToSupabase(storyDetails.videoFile, registrationId);
        } else if (role === 'college' && storyDetails.storyPdf) {
          const fileName = `${registrationId}-${Date.now()}.pdf`;
          const { error: uploadError } = await supabase.storage.from('college-story-pdfs').upload(fileName, storyDetails.storyPdf);
          if (!uploadError) {
            const pdfUrl = getSafeImageUrl(supabase.storage.from('college-story-pdfs').getPublicUrl(fileName).data.publicUrl);
            await supabase.from('clg_registrations').update({ pdf_url: pdfUrl }).eq('id', registrationId);
          }

        }
      }

      setIsComplete(true);
      toast({ title: 'Registration Complete!', description: 'Your story has been submitted successfully.', variant: 'success' });
      return true;
    } catch (error: any) {
      console.error('Submission error:', error);
      toast({ title: 'Error', description: error.message || 'Failed to submit.', variant: 'destructive' });
      return false;
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSignIn = async () => {
    if (!selectedEventId) {
      toast({ title: 'Event Required', description: 'Please select an event first.', variant: 'destructive' });
      return;
    }
    setIsSigningIn(true);
    try {
      const redirectUrl = `${window.location.origin}/register?eventId=${selectedEventId}`;
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: redirectUrl },
      });
      if (error) throw error;
    } catch (error: any) {
      toast({ title: 'Sign In Failed', description: error.message, variant: 'destructive' });
      setIsSigningIn(false);
    }
  };

  const handleNext = async () => {
    const event = events.find(e => e.id === selectedEventId);
    const isFree = event?.is_payment_enabled === false;

    if (currentStep === 1) {
      if (validateStep1()) {
        if (isFree) {
          // Skip Step 2
          if (role || event?.event_type === 'school' || event?.event_type === 'college') {
            setCurrentStep(4);
          } else {
            setCurrentStep(3);
          }
        } else {
          setCurrentStep(2);
        }
      }
      return;
    }
    if (currentStep === 2) {
      if (await validateStep2()) {
        // If role is already set (e.g. from auto-fetch or previous step), skip role selection
        if (role) {
          setCurrentStep(4);
        } else if (event?.event_type === 'school' || event?.event_type === 'college') {
          setCurrentStep(4);
        } else {
          setCurrentStep(3);
        }
      }
      return;
    }
    if (currentStep === 3) { if (role) setCurrentStep(4); return; }
    if (currentStep === 4) { if (validateStep4()) setCurrentStep(5); return; }
    if (currentStep === 5) await submitRegistration();
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      const event = events.find(e => e.id === selectedEventId);
      const isFree = event?.is_payment_enabled === false || !event?.registration_fee || Number(event?.registration_fee) <= 0;

      if (currentStep === 4) {
        if (uniqueKey || isFree) {
          if (role || event?.event_type === 'school' || event?.event_type === 'college') {
            setCurrentStep(1);
          } else {
            setCurrentStep(3);
          }
        } else {
          setCurrentStep(3);
        }
      } else if (currentStep === 3) {
        setCurrentStep(1);
      } else {
        setCurrentStep(currentStep - 1);
      }
    }
  };

  if (isComplete) {
    return (
      <div className="min-h-screen pt-20 flex items-center justify-center bg-gradient-warm">
        <div className="max-w-md w-full mx-auto p-8 text-center bg-card rounded-2xl shadow-xl border border-border">
          <div className="w-20 h-20 mx-auto bg-green-100 rounded-full flex items-center justify-center mb-6">
            <Check className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-3xl font-bold mb-4">Registration Complete!</h1>
          <p className="text-muted-foreground mb-8">You've successfully registered for the competition.</p>
          <div className="flex gap-4">
            <Button onClick={() => navigate('/dashboard')} className="flex-1">Dashboard</Button>
            <Button onClick={() => navigate('/')} variant="outline" className="flex-1">Home</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pt-20 bg-gradient-warm">
      <div className="container mx-auto px-4 py-12 max-w-2xl">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold mb-4">Join the Competition</h1>
          <p className="text-muted-foreground">
            Complete your registration in {
              steps.filter(s => {
                const event = events.find(e => e.id === selectedEventId);
                const isFree = event?.is_payment_enabled === false || !event?.registration_fee || Number(event?.registration_fee) <= 0;

                // If it's step 2 (Key) and (it's free OR key exists), skip it from progress bar
                if (s.id === 2 && (isFree || uniqueKey)) return false;

                // If it's step 3 (Role) and (role is already set/determined), skip it
                if (s.id === 3 && (role || event?.event_type === 'school' || event?.event_type === 'college')) return false;

                return true;
              }).length
            } steps
          </p>
        </div>

        <div className="relative mb-8 pb-10">
          <div className="flex justify-between relative z-10 w-full">
            {steps.filter(s => {
              const event = events.find(e => e.id === selectedEventId);
              const isFree = event?.is_payment_enabled === false || !event?.registration_fee || Number(event?.registration_fee) <= 0;
              if (s.id === 2 && (isFree || uniqueKey)) return false;
              if (s.id === 3 && (role || event?.event_type === 'school' || event?.event_type === 'college')) return false;
              return true;
            }).map((s, idx, filtered) => (
              <div key={s.id} className="flex flex-col items-center">
                <div className={cn("w-10 h-10 rounded-full flex items-center justify-center transition-colors shadow-sm", currentStep >= s.id ? "bg-primary text-white" : "bg-muted text-muted-foreground")}>
                  {currentStep > s.id ? <Check className="w-5 h-5" /> : <s.icon className="w-5 h-5" />}
                </div>
                <span className="text-[10px] sm:text-xs mt-2 font-medium">{s.title}</span>
              </div>
            ))}
          </div>
          <div className="absolute top-5 left-0 right-0 h-0.5 bg-muted -z-0">
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{
                width: (() => {
                  const event = events.find(e => e.id === selectedEventId);
                  const isFree = event?.is_payment_enabled === false || !event?.registration_fee || Number(event?.registration_fee) <= 0;
                  const filteredSteps = steps.filter(s => {
                    if (s.id === 2 && (isFree || uniqueKey)) return false;
                    if (s.id === 3 && (role || event?.event_type === 'school' || event?.event_type === 'college')) return false;
                    return true;
                  });
                  const currentIndex = filteredSteps.findIndex(s => s.id === currentStep);
                  if (currentIndex === -1 && currentStep > 1) {
                    // If current step is hidden, find the nearest visible step after it
                    const lastVisibleIndex = filteredSteps.reduce((acc, s, i) => s.id < currentStep ? i : acc, 0);
                    return `${(lastVisibleIndex / (filteredSteps.length - 1)) * 100}%`;
                  }
                  return `${(Math.max(0, currentIndex) / (filteredSteps.length - 1)) * 100}%`;
                })()
              }}
            />
          </div>
        </div>

        {(() => {
          const event = events.find(e => e.id === selectedEventId);
          if (event && currentStep > 2) {
            const now = new Date();
            const isRegEnabled = event.registration_open ||
              (event.registration_start_date && now > new Date(event.registration_start_date));

            if (!isRegEnabled) {
              return (
                <div className="bg-amber-50 border border-amber-200 rounded-3xl p-8 text-center space-y-4 animate-in fade-in zoom-in-95 mb-10 shadow-lg relative z-20">
                  <Clock className="w-12 h-12 text-amber-500 mx-auto" />
                  <h2 className="text-2xl font-bold text-amber-900">Registration Portal Not Active</h2>
                  <p className="text-amber-700">
                    The story submission portal for <strong>{event.name}</strong> is currently closed.
                    {event.registration_start_date && (
                      <span> It is scheduled to open on {format(new Date(event.registration_start_date), 'MMM d, yyyy h:mm a')}.</span>
                    )}
                  </p>
                  <Button variant="outline" onClick={() => navigate('/events')} className="mt-4">
                    Back to Events
                  </Button>
                </div>
              );
            }
          }
          return null;
        })()}

        {!(() => {
          const event = events.find(e => e.id === selectedEventId);
          if (event && currentStep > 2) {
            const now = new Date();
            const isRegEnabled = event.registration_open ||
              (event.registration_start_date && now > new Date(event.registration_start_date));
            return !isRegEnabled;
          }
          return false;
        })() && (
            <div className="bg-card p-8 rounded-2xl shadow-lg border border-border">
              {currentStep === 1 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                  <h2 className="text-2xl font-bold text-center">Get Started</h2>
                  {!isEventLocked && (
                    <div className="space-y-2">
                      <Label>Select Event</Label>
                      <Select value={selectedEventId} onValueChange={setSelectedEventId}>
                        <SelectTrigger><SelectValue placeholder="Select an event" /></SelectTrigger>
                        <SelectContent>{events.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                  )}
                  {emailStep === 'pending' ? (
                    <Button
                      onClick={handleGoogleSignIn}
                      disabled={isSigningIn || !selectedEventId}
                      className="w-full h-14 text-lg font-semibold bg-white text-black border-2 border-slate-200 hover:bg-slate-50 hover:border-slate-300 transition-all flex items-center justify-center gap-3 group shadow-sm hover:shadow-md"
                    >
                      {isSigningIn ? (
                        <Loader2 className="animate-spin w-6 h-6 text-primary" />
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
                  ) : (
                    <div className="bg-green-50 p-4 rounded-xl flex items-center gap-3 border border-green-100">
                      <Check className="text-green-600" />
                      <span className="font-medium">{verificationEmail}</span>
                      <Button onClick={handleNext} className="ml-auto">Next</Button>
                    </div>
                  )}
                </div>
              )}

              {currentStep === 2 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                  <h2 className="text-2xl font-bold text-center">Verify Your Key</h2>
                  <div className="space-y-2">
                    <Label>Unique Key</Label>
                    <Input value={uniqueKey} onChange={e => setUniqueKey(e.target.value.toUpperCase())} placeholder="Enter your key" className="h-14 text-center text-xl tracking-widest font-mono" />
                  </div>
                  <div className="flex gap-4">
                    <Button onClick={handlePrev} variant="ghost">Back</Button>
                    {isFree && !uniqueKey ? (
                      <Button onClick={handleNext} className="flex-1 h-12 bg-gradient-to-r from-green-600 to-emerald-600">Register for Free</Button>
                    ) : (
                      <Button onClick={handleNext} disabled={!uniqueKey} className="flex-1 h-12">Verify & Continue</Button>
                    )}
                  </div>
                </div>
              )}

              {currentStep === 3 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                  <h2 className="text-2xl font-bold text-center">Select Role</h2>
                  <div className="grid grid-cols-2 gap-4">
                    <Button onClick={() => setRole('school')} variant={role === 'school' ? 'default' : 'outline'} className="h-24 flex-col gap-2">
                      <School /> School
                    </Button>
                    <Button onClick={() => setRole('college')} variant={role === 'college' ? 'default' : 'outline'} className="h-24 flex-col gap-2">
                      <GraduationCap /> College
                    </Button>
                  </div>
                  <div className="flex gap-4">
                    <Button onClick={handlePrev} variant="ghost">Back</Button>
                    <Button onClick={handleNext} disabled={!role} className="flex-1 h-12">Next</Button>
                  </div>
                </div>
              )}

              {currentStep === 4 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                  {(isFree && !uniqueKey) && (
                    <div className="space-y-4 pb-6 border-b border-border/50">
                      <h2 className="text-2xl font-bold">Personal Details</h2>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>First Name</Label>
                          <Input value={personalInfo.firstName} onChange={e => setPersonalInfo(p => ({ ...p, firstName: e.target.value }))} placeholder="John" />
                        </div>
                        <div className="space-y-2">
                          <Label>Last Name</Label>
                          <Input value={personalInfo.lastName} onChange={e => setPersonalInfo(p => ({ ...p, lastName: e.target.value }))} placeholder="Doe" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Phone Number</Label>
                        <Input value={personalInfo.phone} onChange={e => setPersonalInfo(p => ({ ...p, phone: e.target.value }))} placeholder="+91..." />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Age</Label>
                          <Input type="number" value={personalInfo.age} onChange={e => setPersonalInfo(p => ({ ...p, age: e.target.value }))} placeholder="18" />
                        </div>
                        <div className="space-y-2">
                          <Label>City</Label>
                          <Input value={personalInfo.city} onChange={e => setPersonalInfo(p => ({ ...p, city: e.target.value }))} placeholder="Bangalore" />
                        </div>
                      </div>
                      {role === 'college' && (
                        <div className="space-y-4 pt-2">
                          <div className="space-y-2">
                            <Label>College Name</Label>
                            <Input value={personalInfo.collegeName} onChange={e => setPersonalInfo(p => ({ ...p, collegeName: e.target.value }))} placeholder="Enter your college" />
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                              <Label>Degree</Label>
                              <Input value={personalInfo.degree} onChange={e => setPersonalInfo(p => ({ ...p, degree: e.target.value }))} placeholder="B.E. / B.Tech" />
                            </div>
                            <div className="space-y-2">
                              <Label>Branch</Label>
                              <Input value={personalInfo.branch} onChange={e => setPersonalInfo(p => ({ ...p, branch: e.target.value }))} placeholder="CSE / ECE" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <h2 className="text-2xl font-bold">Story Details</h2>
                  <div className="space-y-2"><Label>Story Title</Label><Input value={storyDetails.title} onChange={e => setStoryDetails(s => ({ ...s, title: e.target.value }))} /></div>
                  <div className="space-y-2">
                    <Label>Category</Label>
                    <Select value={storyDetails.category} onValueChange={v => setStoryDetails(s => ({ ...s, category: v }))}>
                      <SelectTrigger><SelectValue placeholder="Select Category" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fiction">Fiction</SelectItem>
                        <SelectItem value="non-fiction">Non-Fiction</SelectItem>
                        <SelectItem value="folklore">Folklore</SelectItem>
                        <SelectItem value="horror">Horror</SelectItem>
                        <SelectItem value="mythology">Mythology</SelectItem>
                        <SelectItem value="adventure">Adventure</SelectItem>
                        <SelectItem value="fable">Fable</SelectItem>
                        <SelectItem value="science-fiction">Science Fiction</SelectItem>
                        <SelectItem value="documentary">Non-Fiction / Documentary</SelectItem>
                        <SelectItem value="others">Others</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <textarea className="w-full h-32 p-3 rounded-md border" value={storyDetails.description} onChange={e => setStoryDetails(s => ({ ...s, description: e.target.value }))} />
                  </div>
                  {role === 'school' ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Guardian Name</Label>
                          <Input value={storyDetails.guardianName} onChange={e => setStoryDetails(s => ({ ...s, guardianName: e.target.value }))} placeholder="Parent/Guardian Name" />
                        </div>
                        <div className="space-y-2">
                          <Label>Guardian Contact</Label>
                          <Input value={storyDetails.guardianPhone} onChange={e => setStoryDetails(s => ({ ...s, guardianPhone: e.target.value }))} placeholder="Phone Number" />
                        </div>
                      </div>
                      <div className="space-y-2">
                        <Label>Class Level</Label>
                        <Select value={storyDetails.classLevel} onValueChange={v => setStoryDetails(s => ({ ...s, classLevel: v }))}>
                          <SelectTrigger><SelectValue placeholder="Select Class Level" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="Tiny Tales">Tiny Tales (3rd - 5th Grade)</SelectItem>
                            <SelectItem value="Young Dreamers">Young Dreamers (6th - 8th Grade)</SelectItem>
                            <SelectItem value="Story Champions">Story Champions (9th - 12th Grade)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      {selectedEvent?.submission_mode === 'institutional' ? (
                        <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl space-y-2 animate-in fade-in zoom-in-95">
                          <p className="text-sm text-orange-800 font-medium flex items-center gap-2">
                            <Video className="w-4 h-4" /> Institutional Submission Mode
                          </p>
                          <p className="text-xs text-orange-700">
                            Since this is an institutional event, your video submission will be handled directly by your institution. You only need to provide the story details here.
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <Label>Upload Video</Label>
                          <Input
                            type="file"
                            accept="video/*"
                            onChange={e => {
                              const file = e.target.files?.[0] || null;
                              if (file && file.size > 500 * 1024 * 1024) {
                                toast({ title: 'File Too Large', description: 'Video must be under 500 MB.', variant: 'destructive' });
                                e.target.value = '';
                                return;
                              }
                              setStoryDetails(s => ({ ...s, videoFile: file }));
                            }}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>Upload PDF</Label>
                      {selectedEvent?.submission_mode === 'institutional' ? (
                        <div className="p-4 bg-orange-50 border border-orange-100 rounded-xl space-y-2 animate-in fade-in zoom-in-95">
                          <p className="text-sm text-orange-800 font-medium flex items-center gap-2">
                            <FileType className="w-4 h-4" /> Institutional Submission Mode
                          </p>
                          <p className="text-xs text-orange-700">
                            Since this is an institutional event, your story PDF will be handled directly by your institution. You only need to provide the story details here.
                          </p>
                        </div>
                      ) : (
                        <Input type="file" accept=".pdf" onChange={e => setStoryDetails(s => ({ ...s, storyPdf: e.target.files?.[0] || null }))} />
                      )}
                    </div>
                  )}
                  <div className="flex gap-4">
                    <Button onClick={handlePrev} variant="outline">Back</Button>
                    <Button onClick={handleNext} className="flex-1 h-12">Next</Button>
                  </div>
                </div>
              )}

              {currentStep === 5 && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                  <h2 className="text-2xl font-bold text-center">Review & Submit</h2>
                  <div className="bg-muted p-4 rounded-xl space-y-2 text-sm italic">
                    <p><strong>Event:</strong> {events.find(e => e.id === selectedEventId)?.name}</p>
                    <p><strong>Title:</strong> {storyDetails.title}</p>
                    <p><strong>Category:</strong> {storyDetails.category}</p>
                    {role === 'school' && (
                      <>
                        <p><strong>Class:</strong> {storyDetails.classLevel}</p>
                        <p><strong>Guardian:</strong> {storyDetails.guardianName} ({storyDetails.guardianPhone})</p>
                      </>
                    )}
                    <p><strong>Key:</strong> {uniqueKey}</p>
                  </div>
                  <div className="flex gap-4">
                    <Button onClick={handlePrev} variant="outline">Back</Button>
                    <Button onClick={handleNext} disabled={isSubmitting} className="flex-1 h-12">
                      {isSubmitting ? <Loader2 className="animate-spin mr-2" /> : <Check className="mr-2" />}
                      Submit Registration
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
      </div>
    </div>
  );
};

export default Register;
