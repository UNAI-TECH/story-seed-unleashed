import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link, useSearchParams } from 'react-router-dom';
import { Smartphone, QrCode, ArrowRight, Loader2, Check, School, GraduationCap, Copy, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';

declare global {
  interface Window {
    ZPayments: any;
  }
}

const generateUniqueKey = () => {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
};

const PaymentPortal = () => {
  const { eventId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [user, setUser] = useState<any>(null);

  const [step, setStep] = useState<1 | 2 | 3>(1); // 1: Personal, 2: Payment, 3: Success
  const [personalInfo, setPersonalInfo] = useState({
    firstName: '',
    lastName: '',
    phone: '',
    age: '',
    city: '',
    schoolName: '',
    collegeName: '',
    classLevel: '',
    degree: '',
    branch: '',
    role: null as 'school' | 'college' | null
  });

  const [paymentMethod, setPaymentMethod] = useState<'upi' | 'qr'>('upi');
  const [transactionId, setTransactionId] = useState('');
  const [senderName, setSenderName] = useState('');
  const [uniqueKey, setUniqueKey] = useState('');

  useEffect(() => {
    const checkAuthAndFetchEvent = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast({
          title: 'Login Required',
          description: 'Please log in to participate in events.',
          variant: 'destructive',
        });
        navigate(`/user?redirect=/pay-event/${eventId}`);
        return;
      }
      setUser(session.user);

      if (!eventId) return;

      const { data, error } = await supabase
        .from('events')
        .select('*')
        .eq('id', eventId)
        .single();

      if (error || !data) {
        toast({
          title: 'Error',
          description: 'Event not found.',
          variant: 'destructive',
        });
        navigate('/');
        return;
      }
      setEvent(data);

      // 3. New: Check if user already has a registration
      const { data: existingReg } = await supabase
        .from('registrations')
        .select('unique_key, payment_status')
        .eq('event_id', eventId)
        .eq('user_id', session.user.id)
        .maybeSingle();

      const { data: existingClgReg } = await supabase
        .from('clg_registrations')
        .select('unique_key, payment_status')
        .eq('event_id', eventId)
        .eq('user_id', session.user.id)
        .maybeSingle();

      const reg = existingReg || existingClgReg;

      if (reg && reg.payment_status === 'paid') {
        console.log('User already registered, jumping to Step 3');
        setUniqueKey(reg.unique_key);
        setPersonalInfo(prev => ({
          ...prev,
          role: existingReg ? 'school' : 'college'
        }));
        setStep(3);
      } else {
        // Auto-set role if fixed for new registrations
        if (data.event_type === 'school') {
          setPersonalInfo(prev => ({ ...prev, role: 'school' }));
        } else if (data.event_type === 'college') {
          setPersonalInfo(prev => ({ ...prev, role: 'college' }));
        }
      }

      setLoading(false);
    };

    checkAuthAndFetchEvent();
  }, [eventId, navigate, toast]);

  const validatePersonalStep = () => {
    const { firstName, lastName, phone, age, city, role } = personalInfo;
    if (!firstName || !lastName || !phone || !age || !city || !role) {
      toast({
        title: 'Missing Information',
        description: 'Please fill all personal details and select your role.',
        variant: 'destructive',
      });
      return false;
    }

    if (role === 'school' && !personalInfo.schoolName) {
      toast({ title: 'School Name Required', variant: 'destructive' });
      return false;
    }
    if (role === 'college' && !personalInfo.collegeName) {
      toast({ title: 'College Name Required', variant: 'destructive' });
      return false;
    }

    return true;
  };

  const isEventFree = !event?.is_payment_enabled || !event?.registration_fee || event.registration_fee <= 0;

  const handleZohoPayment = async () => {
    try {
      setSubmitting(true);

      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) {
        toast({ title: 'Error', description: 'You must be logged in to pay.', variant: 'destructive' });
        setSubmitting(false);
        return;
      }

      // 1. Validate registration fee
      if (isEventFree) {
        // This should normally not be reachable due to bypass, but added as safety
        await submitPaymentToDB({ method: 'free' });
        return;
      }

      if (!event.registration_fee || event.registration_fee <= 0) {
        toast({ title: 'Error', description: 'Event registration fee not set. Please contact support.', variant: 'destructive' });
        setSubmitting(false);
        return;
      }

      // 2. Create Payment Link via Edge Function
      const { data, error } = await supabase.functions.invoke('zoho-payment-handler', {
        body: {
          action: 'create-link',
          amount: event.registration_fee,
          customer_id: authSession.user.id,
          order_id: eventId,
          email: authSession.user.email
        },
      });

      if (error || !data?.payment_url) {
        console.error('Link creation error details:', { error, data });
        let errorMsg = 'Failed to create payment link';

        if (data?.error) {
          errorMsg = `${data.error} (Status: ${data.status || 'unknown'})`;
        } else if (error?.message) {
          errorMsg = error.message;
        }

        throw new Error(errorMsg);
      }

      // 3. Redirect to Zoho Hosted Page
      window.location.href = data.payment_url;

    } catch (error: any) {
      console.error('Payment Error Flow:', error);
      toast({
        title: 'Payment Error',
        description: error.message || 'An unexpected error occurred during payment link creation.',
        variant: 'destructive'
      });
      setSubmitting(false);
    }
  };

  const submitPaymentToDB = async (paymentDetails: any) => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      const user = session.user;
      const key = generateUniqueKey();

      const tableName = personalInfo.role === 'school' ? 'registrations' : 'clg_registrations';

      const payload: any = {
        event_id: eventId,
        user_id: user.id,
        first_name: personalInfo.firstName,
        last_name: personalInfo.lastName,
        email: user.email,
        phone: personalInfo.phone,
        age: parseInt(personalInfo.age),
        city: personalInfo.city,
        story_title: null,
        category: null,
        story_description: null,
        payment_status: 'paid',
        unique_key: key,
        payment_details: paymentDetails,
      };

      if (personalInfo.role === 'school') {
        payload.class_level = personalInfo.classLevel;
      } else {
        payload.college_name = personalInfo.collegeName;
        payload.degree = personalInfo.degree;
        payload.branch = personalInfo.branch;
      }

      const { error } = await supabase
        .from(tableName)
        .insert(payload);

      if (error) throw error;

      // Update profile institution/college
      if (user.id) {
        const profileUpdate: any = {};
        if (personalInfo.role === 'school' && personalInfo.schoolName) {
          profileUpdate.institution = personalInfo.schoolName;
        } else if (personalInfo.role === 'college' && personalInfo.collegeName) {
          profileUpdate.institution = personalInfo.collegeName;
        }

        if (Object.keys(profileUpdate).length > 0) {
          await supabase.from('profiles').update(profileUpdate).eq('id', user.id);
        }
      }

      setUniqueKey(key);

      // Dynamic Redirection Logic
      const now = new Date();
      const isRegOpen = event.registration_open ||
        (event.registration_start_date && now > new Date(event.registration_start_date));

      if (isRegOpen) {
        toast({ title: 'Success', description: 'Redirecting to story submission...', });
        // Small delay so they see the success message
        setTimeout(() => {
          navigate(`/register?eventId=${eventId}&key=${key}`);
        }, 1500);
      } else {
        setStep(3);
        toast({ title: 'Success', description: 'Payment successful! Unique key generated.', });
      }
    } catch (error: any) {
      console.error('DB Insert Error:', error);
      toast({ title: 'Registration Failed', description: error.message + ' (Payment was successful, please contact support)', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  // Handle return from Zoho Payment Link
  useEffect(() => {
    const status = searchParams.get('status');
    const paymentId = searchParams.get('payment_id');

    if (status === 'success' && event && !submitting) {
      const finalizePayment = async () => {
        setSubmitting(true);
        await submitPaymentToDB({
          paymentId: paymentId || 'hosted_link',
          method: 'zoho_link'
        });
      };
      finalizePayment();
    }
  }, [searchParams, event, step, submitting]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background py-20">
      <div className="container mx-auto px-4 max-w-2xl">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-display font-bold mb-4">Event <span className="text-gradient">Participation</span></h1>
          <p className="text-muted-foreground text-lg">
            {step === 1 ? 'Step 1: Personal Details' : step === 2 ? 'Step 2: Payment' : 'Step 3: Registration Key'}
          </p>
          <p className="text-primary font-medium">{event.name}</p>
        </div>

        <div className="backdrop-blur-xl bg-white/10 dark:bg-black/10 border border-white/20 dark:border-white/10 rounded-3xl p-8 shadow-2xl">
          {step === 1 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>First Name</Label>
                  <Input
                    value={personalInfo.firstName}
                    onChange={e => setPersonalInfo(p => ({ ...p, firstName: e.target.value }))}
                    placeholder="John"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Last Name</Label>
                  <Input
                    value={personalInfo.lastName}
                    onChange={e => setPersonalInfo(p => ({ ...p, lastName: e.target.value }))}
                    placeholder="Doe"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input
                  value={personalInfo.phone}
                  onChange={e => setPersonalInfo(p => ({ ...p, phone: e.target.value }))}
                  placeholder="+91..."
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Age</Label>
                  <Input
                    type="number"
                    value={personalInfo.age}
                    onChange={e => setPersonalInfo(p => ({ ...p, age: e.target.value }))}
                    placeholder="18"
                  />
                </div>
                <div className="space-y-2">
                  <Label>City</Label>
                  <Input
                    value={personalInfo.city}
                    onChange={e => setPersonalInfo(p => ({ ...p, city: e.target.value }))}
                    placeholder="Bangalore"
                  />
                </div>
              </div>

              {event.event_type === 'both' && (
                <div className="space-y-2">
                  <Label>Select Category</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <Button
                      onClick={() => setPersonalInfo(p => ({ ...p, role: 'school' }))}
                      variant={personalInfo.role === 'school' ? 'default' : 'outline'}
                      className="h-12"
                    >
                      <School className="mr-2 h-4 w-4" /> School
                    </Button>
                    <Button
                      onClick={() => setPersonalInfo(p => ({ ...p, role: 'college' }))}
                      variant={personalInfo.role === 'college' ? 'default' : 'outline'}
                      className="h-12"
                    >
                      <GraduationCap className="mr-2 h-4 w-4" /> College
                    </Button>
                  </div>
                </div>
              )}

              {personalInfo.role === 'school' && (
                <div className="space-y-2">
                  <Label>School Name</Label>
                  <Input
                    value={personalInfo.schoolName}
                    onChange={e => setPersonalInfo(p => ({ ...p, schoolName: e.target.value }))}
                    placeholder="Enter school name"
                  />
                </div>
              )}

              {personalInfo.role === 'college' && (
                <div className="space-y-2">
                  <Label>College Name</Label>
                  <Input
                    value={personalInfo.collegeName}
                    onChange={e => setPersonalInfo(p => ({ ...p, collegeName: e.target.value }))}
                    placeholder="Enter college name"
                  />
                </div>
              )}

              <Button
                onClick={() => {
                  if (validatePersonalStep()) {
                    if (isEventFree) {
                      setSubmitting(true);
                      submitPaymentToDB({ method: 'free' });
                    } else {
                      setStep(2);
                    }
                  }
                }}
                disabled={submitting}
                className="w-full h-14 bg-primary text-white text-lg font-bold rounded-2xl"
              >
                {submitting ? (
                  <Loader2 className="w-6 h-6 animate-spin mr-2" />
                ) : isEventFree ? (
                  <>
                    Register for Free
                    <Check className="w-6 h-6 ml-2" />
                  </>
                ) : (
                  <>
                    Continue to Payment
                    <ArrowRight className="w-6 h-6 ml-2" />
                  </>
                )}
              </Button>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-2">Registration Fee: ₹{event.registration_fee || 99}</h2>
                <p className="text-muted-foreground">Secure payment via Zoho Payments</p>
              </div>

              <div className="bg-muted p-4 rounded-lg flex items-center justify-between">
                <div>
                  <p className="font-medium">{event?.name}</p>
                  <p className="text-sm text-muted-foreground">{personalInfo.role === 'school' ? 'School' : 'College'} Category</p>
                </div>
                <div className="font-bold text-xl">₹{event.registration_fee || 99}.00</div>
              </div>

              <div className="flex gap-4">
                <Button onClick={() => setStep(1)} variant="ghost" disabled={submitting} className="h-12">Back</Button>
                <Button onClick={handleZohoPayment} disabled={submitting} className="flex-1 h-12 bg-[#9B1B1B] hover:bg-[#7d1616] text-white">
                  {submitting ? <Loader2 className="animate-spin mr-2" /> : 'Pay Now'}
                </Button>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-8 animate-in zoom-in-95 text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <Check className="w-10 h-10 text-green-600" />
              </div>
              <div>
                <h2 className="text-3xl font-bold mb-2">Payment Successful!</h2>
                <p className="text-muted-foreground">Your unique registration key has been generated.</p>
              </div>

              <div className="bg-primary/5 border border-primary/20 rounded-3xl p-8 space-y-4">
                <p className="text-sm font-medium text-muted-foreground uppercase tracking-widest">Your Unique Registration Key</p>
                <div className="flex flex-col items-center gap-4">
                  <div className="text-5xl font-mono font-bold text-primary tracking-widest select-all">
                    {uniqueKey}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-primary hover:text-primary/80 hover:bg-primary/5"
                    onClick={() => {
                      navigator.clipboard.writeText(uniqueKey);
                      toast({ title: 'Key Copied!', description: 'Unique key copied to clipboard.' });
                    }}
                  >
                    <Copy className="w-4 h-4 mr-2" />
                    Copy Key
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">Please save this key safely. You will need it to submit your story.</p>
              </div>

              {(() => {
                const now = new Date();
                const isRegOpen = event.registration_open ||
                  (event.registration_start_date && now > new Date(event.registration_start_date));

                if (!isRegOpen) {
                  return (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-6 text-amber-900">
                      <div className="flex items-center justify-center gap-2 mb-2 font-bold">
                        <Clock className="w-5 h-5" />
                        Portal Not Yet Open
                      </div>
                      <p className="text-sm">
                        The registration portal is scheduled to open on:
                        <br />
                        <span className="font-bold">
                          {event.registration_start_date ? new Date(event.registration_start_date).toLocaleDateString('en-IN', {
                            day: 'numeric',
                            month: 'long',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit'
                          }) : 'TBA'}
                        </span>
                      </p>
                    </div>
                  );
                }

                return (
                  <Button
                    onClick={() => navigate(`/register?eventId=${eventId}&key=${uniqueKey}`)}
                    className="w-full h-14 bg-green-600 hover:bg-green-700 text-white text-lg font-bold rounded-2xl"
                  >
                    Submit My Story Now
                    <ArrowRight className="w-6 h-6 ml-2" />
                  </Button>
                );
              })()}

              <div className="space-y-4 pt-4">
                <Button
                  onClick={() => navigate('/dashboard')}
                  variant="outline"
                  className="w-full h-12 rounded-xl"
                >
                  Go to Dashboard
                </Button>
                <Link to="/" className="block text-sm text-muted-foreground hover:text-foreground">
                  Back to Home
                </Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PaymentPortal;
