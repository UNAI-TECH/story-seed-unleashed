import { Link } from 'react-router-dom';
import { Calendar, Users, ArrowRight, Check, Vote, Star, GraduationCap, School } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { getSafeImageUrl } from '@/integrations/supabase/client';

interface EventCardProps {
    event: {
        id: string;
        name: string;
        description: string | null;
        banner_image: string | null;
        start_date: string | null;
        end_date: string | null;
        registration_deadline?: string | null;
        registration_open: boolean;
        is_payment_enabled: boolean;
        payment_deadline: string | null;
        registration_start_date: string | null;
        registration_fee: number | null;
        participantCount: number;
        status: 'live' | 'upcoming' | 'ended';
        event_type?: 'school' | 'college' | 'both';
        userStatus?: 'none' | 'paid' | 'registered';
    };
    index?: number;
}

export const EventCard = ({ event, index = 0 }: EventCardProps) => {
    const now = new Date();

    const formatDateRange = (start: string | null, end: string | null) => {
        if (!start) return 'TBD';
        const startDate = format(new Date(start), 'MMM d, yyyy');
        if (end) {
            const endDate = format(new Date(end), 'MMM d, yyyy');
            return `${startDate} - ${endDate}`;
        }
        return startDate;
    };

    const isFree = !event.is_payment_enabled || !event.registration_fee || event.registration_fee <= 0;

    const isPayEnabled = !isFree &&
        (!event.payment_deadline || now < new Date(event.payment_deadline));

    const isRegEnabled = event.registration_open ||
        (event.registration_start_date && now > new Date(event.registration_start_date));

    const getStatusBadge = () => {
        switch (event.status) {
            case 'live':
                return (
                    <span className="px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-sm bg-red-500/90 text-white">
                        🔴 Live Now
                    </span>
                );
            case 'upcoming':
                return (
                    <span className="px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-sm bg-blue-500/90 text-white">
                        Coming Soon
                    </span>
                );
            case 'ended':
                return (
                    <span className="px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-sm bg-gray-500/90 text-white">
                        Ended
                    </span>
                );
            default:
                return null;
        }
    };

    return (
        <div
            className="group relative animate-fade-in h-full"
            style={{ animationDelay: `${index * 0.1}s` }}
        >
            {/* Glass-morphism Card */}
            <div className="relative flex flex-col h-full backdrop-blur-xl bg-white/10 dark:bg-black/10 border border-white/20 dark:border-white/10 rounded-3xl overflow-hidden shadow-2xl transition-all duration-300 hover:scale-[1.02] hover:shadow-primary/20">

                {/* Background Image with Overlay */}
                <div className="relative aspect-[16/10] overflow-hidden">
                    <img
                        src={getSafeImageUrl(event.banner_image) || 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?w=800&q=80'}
                        alt={event.name}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />

                    {/* Status Badge */}
                    <div className="absolute top-4 left-4">
                        {getStatusBadge()}
                    </div>

                    {/* Category/Type Badge */}
                    {event.event_type && event.event_type !== 'both' && (
                        <div className="absolute top-4 right-4">
                            <span className="px-3 py-1.5 rounded-full text-xs font-semibold backdrop-blur-sm bg-white/20 text-white border border-white/30 flex items-center gap-1.5">
                                {event.event_type === 'school' ? <School className="w-3 h-3" /> : <GraduationCap className="w-3 h-3" />}
                                {event.event_type.charAt(0).toUpperCase() + event.event_type.slice(1)}
                            </span>
                        </div>
                    )}
                </div>

                {/* Content */}
                <div className="p-6 flex flex-col flex-1 space-y-4">
                    <div className="space-y-2">
                        <h3 className="font-display text-xl font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2 min-h-[3.5rem]">
                            {event.name}
                        </h3>
                        <p className="text-muted-foreground text-sm line-clamp-3">
                            {event.description || 'Join this exciting storytelling competition!'}
                        </p>
                    </div>

                    {/* Meta Section */}
                    <div className="mt-auto space-y-3">
                        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                                <div className="flex items-center gap-1.5">
                                    <Calendar className="w-4 h-4 text-primary" />
                                    <span>{formatDateRange(event.start_date, event.end_date).split(' - ')[0]}</span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                    <Users className="w-4 h-4 text-primary" />
                                    <span>{event.participantCount}+ joining</span>
                                </div>
                            </div>

                            {event.registration_deadline && (
                                <div className="text-xs text-amber-600 dark:text-amber-400 font-medium flex items-center gap-1.5">
                                    <Star className="w-3 h-3" />
                                    Reg. closes: {format(new Date(event.registration_deadline), 'MMM d, yyyy')}
                                </div>
                            )}
                        </div>

                        {/* Action Buttons */}
                        <div className="flex flex-col sm:flex-row gap-3 pt-2">
                            {(() => {
                                if (event.userStatus === 'registered') {
                                    return (
                                        <Button variant="outline" className="flex-1 bg-green-500/10 text-green-600 border-green-500/20 cursor-default hover:bg-green-500/10 h-11">
                                            <Check className="w-4 h-4 mr-2" /> Registered
                                        </Button>
                                    );
                                }

                                if (event.userStatus === 'paid') {
                                    if (isRegEnabled) {
                                        return (
                                            <Link to={`/register?eventId=${event.id}`} className="flex-1">
                                                <Button variant="hero" className="w-full group bg-gradient-to-r from-green-600 to-emerald-600 hover:opacity-90 h-11">
                                                    Submit Story
                                                    <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                                                </Button>
                                            </Link>
                                        );
                                    }
                                    return (
                                        <Button variant="outline" className="flex-1 bg-blue-500/10 text-blue-600 border-blue-500/20 cursor-default h-11">
                                            Paid - Awaiting Submission
                                        </Button>
                                    );
                                }

                                if (isPayEnabled || isFree) {
                                    return (
                                        <Link to={isFree ? `/register?eventId=${event.id}&isFree=true` : `/pay-event/${event.id}`} className="flex-1">
                                            <Button variant="hero" className="w-full group bg-gradient-to-r from-[#9B1B1B] via-[#FF6B35] to-[#D4AF37] hover:opacity-90 h-11">
                                                {isFree ? 'Register Now' : 'Register Now'}
                                                <ArrowRight className="w-4 h-4 ml-2 transition-transform group-hover:translate-x-1" />
                                            </Button>
                                        </Link>
                                    );
                                }

                                if (isRegEnabled) {
                                    return (
                                        <Button variant="outline" className="flex-1 opacity-50 cursor-not-allowed h-11" disabled>
                                            Payment Closed
                                        </Button>
                                    );
                                }

                                return (
                                    <Button variant="outline" className="flex-1 opacity-50 cursor-not-allowed h-11" disabled>
                                        Registration Closed
                                    </Button>
                                );
                            })()}

                            {/* Secondary CTA: Voting / Details */}
                            {event.event_type === 'school' ? (
                                <Link to={`/voting/${event.id}`} className="flex-1">
                                    <Button variant="outline" className="w-full group bg-white dark:bg-black/20 text-[#9B1B1B] hover:bg-[#9B1B1B] hover:text-white border-2 border-[#9B1B1B] transition-all duration-300 font-semibold h-11">
                                        <Vote className="w-4 h-4 mr-2" />
                                        Vote
                                    </Button>
                                </Link>
                            ) : (
                                <Link to={`/events`} className="flex-1">
                                    <Button variant="outline" className="w-full h-11 border-border hover:bg-muted font-medium transition-colors">
                                        View Details
                                    </Button>
                                </Link>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
