import { useState, useEffect, useRef } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Menu, X, LogOut, User, Search, Calendar, Loader2 } from 'lucide-react';
import { toast } from '@/hooks/use-toast';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SearchBar } from '@/components/ui/search-bar';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { supabase, getSafeImageUrl } from '@/integrations/supabase/client';

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
interface Event {
  id: string;
  name: string;
  registration_open: boolean | null;
}
export const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [events, setEvents] = useState<Event[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [mobileShowResults, setMobileShowResults] = useState(false);
  const [isUserRegistered, setIsUserRegistered] = useState(false);
  const [isGoogleSigningIn, setIsGoogleSigningIn] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);
  const location = useLocation();
  const navigate = useNavigate();
  const {
    user,
    isAuthenticated,
    logout,
    role
  } = useAuth();
  const [hoveredPath, setHoveredPath] = useState(location.pathname);
  useEffect(() => {
    setHoveredPath(location.pathname);
  }, [location.pathname]);

  // Check if user is verified (verified flag must be true)
  useEffect(() => {
    const checkUserVerification = () => {
      const isVerified = localStorage.getItem('story_seed_verified') === 'true';
      setIsUserRegistered(isVerified);
    };
    checkUserVerification();

    // Listen for storage changes (when user registers or logs out)
    const handleStorageChange = () => {
      checkUserVerification();
    };
    window.addEventListener('storage', handleStorageChange);

    // Also check on route change
    return () => {
      window.removeEventListener('storage', handleStorageChange);
    };
  }, [location.pathname]);

  // Build nav links dynamically based on registration status
  const getNavLinks = () => {
    const baseLinks = [{
      name: 'Home',
      path: '/'
    }, {
      name: 'About Us',
      path: '/about'
    }, {
      name: 'Events',
      path: '/events'
    }, {
      name: 'Gallery',
      path: '/gallery'
    }, {
      name: 'Leaderboard',
      path: '/leaderboard'
    }];

    // Show Dashboard only for logged-in users OR admin/judge
    if (isUserRegistered) {
      // Regular user dashboard
      baseLinks.push({
        name: 'Dashboard',
        path: '/dashboard'
      });
    } else if (isAuthenticated && role === 'admin') {
      baseLinks.push({
        name: 'Dashboard',
        path: '/admin/dashboard'
      });
    } else if (isAuthenticated && role === 'judge') {
      baseLinks.push({
        name: 'Dashboard',
        path: '/judge/dashboard'
      });
    }
    baseLinks.push({
      name: 'Contact',
      path: '/contact'
    });
    return baseLinks;
  };
  const navLinks = getNavLinks();

  // Fetch events on mount
  useEffect(() => {
    const fetchEvents = async () => {
      const {
        data
      } = await supabase.from('events').select('id, name, registration_open').eq('is_active', true).eq('results_announced', false);
      setEvents(data || []);
    };
    fetchEvents();
  }, []);

  // Close search results when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowResults(false);
      }
      if (mobileSearchRef.current && !mobileSearchRef.current.contains(event.target as Node)) {
        setMobileShowResults(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 20);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);
  useEffect(() => {
    setIsOpen(false);
  }, [location]);
  const handleLogout = async () => {
    // Clear all user session data and reset verification
    localStorage.removeItem('story_seed_user_phone');
    localStorage.removeItem('story_seed_user_name');
    localStorage.removeItem('story_seed_user_id');
    localStorage.removeItem('story_seed_user_email');
    localStorage.removeItem('story_seed_user_role');
    localStorage.removeItem('story_seed_session_id');
    localStorage.removeItem('story_seed_verified');
    setIsUserRegistered(false);
    await logout();
    navigate('/');
  };
  const getDashboardPath = () => {
    switch (role) {
      case 'admin':
        return '/admin/dashboard';
      case 'judge':
        return '/judge/dashboard';
      default:
        return '/dashboard';
    }
  };
  const handleGoogleSignIn = async () => {
    setIsGoogleSigningIn(true);
    try {
      const {
        error
      } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/`
        }
      });
      if (error) throw error;
    } catch (error: any) {
      console.error('Error signing in with Google:', error);
      toast({
        title: 'Sign in failed',
        description: error.message || 'Could not sign in with Google',
        variant: 'destructive'
      });
      setIsGoogleSigningIn(false);
    }
  };

  // Listen for auth state changes to set verification status
  useEffect(() => {
    const {
      data: {
        subscription
      }
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_IN' && session?.user) {
        // Set verified status in localStorage
        localStorage.setItem('story_seed_verified', 'true');
        localStorage.setItem('story_seed_user_email', session.user.email || '');
        localStorage.setItem('story_seed_user_id', session.user.id);
        localStorage.setItem('story_seed_user_name', session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || '');
        setIsUserRegistered(true);
        setIsGoogleSigningIn(false);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // Filter events based on search query
  const filteredEvents = events.filter(event => event.name.toLowerCase().includes(searchQuery.toLowerCase()));
  const handleEventClick = (event: Event) => {
    if (!event.registration_open) {
      return; // Don't navigate if registration is closed
    }
    // Scroll to top before navigation
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
    navigate(`/register?eventId=${event.id}`);
    setSearchQuery('');
    setShowResults(false);
    setMobileShowResults(false);
    setIsOpen(false);
  };
  const handleNavClick = (path: string) => {
    // Scroll to top smoothly when clicking nav links
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };
  return <>
    <nav style={{
      transition: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)'
    }} className={cn('fixed top-0 left-0 right-0 z-50 border-b',
      scrolled ? 'py-2 bg-white backdrop-blur-lg border-border/60 shadow-md' : 'py-4 bg-transparent border-transparent shadow-none')}>
      <div className="container mx-auto px-3 sm:px-4 max-w-7xl">
        <div className="flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center group">
            <div className="h-10 sm:h-12 px-2 sm:px-4 py-1 bg-gradient-to-r from-[#9B1B1B] via-[#FF6B35] to-[#D4AF37] rounded-lg flex items-center justify-center transition-transform group-hover:scale-105 shadow-md overflow-hidden">
              <img src="/assets/logo.png" alt="Story Seed Studio" className="h-10 sm:h-12 w-auto scale-150" />
            </div>
          </Link>

          {/* Desktop Navigation - Floating Pill Style */}
          <div className="hidden lg:flex items-center p-1.5 rounded-full bg-gradient-to-r from-[#9B1B1B] via-[#FF6B35] to-[#D4AF37] border border-white/10 shadow-sm ml-8">
            {navLinks.map(link => {
              const isActive = location.pathname === link.path;
              return <Link key={link.path} to={link.path} onClick={() => handleNavClick(link.path)} onMouseEnter={() => setHoveredPath(link.path)} onMouseLeave={() => setHoveredPath(location.pathname)} className="relative px-5 py-2 rounded-full text-sm font-medium transition-colors">
                {/* Animated Background */}
                {hoveredPath === link.path && <motion.div layoutId="navbar-pill" className="absolute inset-0 bg-white rounded-full" transition={{
                  type: "spring",
                  stiffness: 350,
                  damping: 30
                }} />}
                <span className={cn("relative z-10 transition-colors duration-200", hoveredPath === link.path ? "text-[#9B1B1B] font-bold" : "text-white hover:text-white/90")}>
                  {link.name}
                </span>
              </Link>;
            })}
          </div>

          {/* Desktop CTA */}
          <div className="hidden lg:flex items-center gap-3">
            {/* Search Box with Event Results */}
            <div className="w-64 z-50">
              <SearchBar value={searchQuery} onChange={setSearchQuery} results={filteredEvents} onResultClick={handleEventClick} />
            </div>
            {isAuthenticated && user && (role === 'admin' || role === 'judge') && <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-2 p-1 rounded-full hover:bg-muted transition-colors">
                  <Avatar className="w-9 h-9">
                    <AvatarImage src={getSafeImageUrl(user.avatar || undefined)} alt={user.name} />

                    <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                      {user.name?.charAt(0)?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 bg-card">
                <div className="px-3 py-2">
                  <p className="font-medium text-foreground">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.email}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link to={getDashboardPath()} className="cursor-pointer">
                    <User className="w-4 h-4 mr-2" />
                    Dashboard
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive">
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>}
          </div>

          {/* Mobile Menu Button */}
          <button onClick={() => setIsOpen(!isOpen)} className="lg:hidden p-2 text-foreground hover:text-primary transition-colors">
            {isOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Navigation */}
        <div className={cn('lg:hidden overflow-hidden transition-all duration-300', isOpen ? 'max-h-[85vh] opacity-100 mt-4' : 'max-h-0 opacity-0')}>
          <div className="bg-card rounded-xl p-4 shadow-lg space-y-2 max-h-[85vh] overflow-y-auto overscroll-contain">
            {navLinks.map(link => <Link key={link.path} to={link.path} onClick={() => handleNavClick(link.path)} className={cn('block px-4 py-3 rounded-lg font-medium transition-colors', location.pathname === link.path ? 'bg-primary/10 text-primary' : 'text-foreground/80 hover:bg-muted')}>
              {link.name}
            </Link>)}
            <div className="pt-4 border-t border-border space-y-2">
              {/* Mobile Search Box with Event Results */}
              <div className="px-4 pb-2 w-full flex justify-center">
                <SearchBar value={searchQuery} onChange={setSearchQuery} results={filteredEvents} onResultClick={handleEventClick} className="w-full max-w-[340px]" />
              </div>
              {isAuthenticated && user && (role === 'admin' || role === 'judge') ? (
                <>
                  <div className="flex items-center gap-3 px-4 py-2">
                    <Avatar className="w-10 h-10">
                      <AvatarImage src={getSafeImageUrl(user.avatar || undefined)} alt={user.name} />

                      <AvatarFallback className="bg-primary text-primary-foreground font-semibold">
                        {user.name?.charAt(0)?.toUpperCase() || 'U'}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium text-foreground">{user.name}</p>
                      <p className="text-xs text-muted-foreground">{user.email}</p>
                    </div>
                  </div>
                  <Link to={getDashboardPath()} className="block">
                    <Button variant="outline" className="w-full">
                      <User className="w-4 h-4 mr-2" />
                      Dashboard
                    </Button>
                  </Link>
                  <Button variant="ghost" className="w-full text-destructive" onClick={handleLogout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Logout
                  </Button>
                </>
              ) : (
                <Button
                  variant="default"
                  className="w-full"
                  onClick={handleGoogleSignIn}
                  disabled={isGoogleSigningIn}
                >
                  {isGoogleSigningIn ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <User className="w-4 h-4 mr-2" />
                  )}
                  {isGoogleSigningIn ? 'Signing in...' : 'Sign in with Google'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </nav>
  </>;
};