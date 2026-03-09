import { useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Quote } from 'lucide-react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';
import AnimatedBlobCard from './AnimatedBlobCard';

interface LeaderQuote {
  id: number;
  name: string;
  title: string;
  image: string;
  quote: string;
  link?: string;
  blur?: boolean;
}

const leaderQuotes: LeaderQuote[] = [
  {
    id: 0,
    name: 'Mercury Matric hr sec school',
    title: 'Rising Little Voice Event Completion',
    image: '/assets/mercury-school.JPG',
    quote: 'A celebration of young voices and storytelling excellence at Mercury School.',
    link: '/gallery',
    blur: false
  }
];

export const HeroSection = () => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [isAutoPlaying, setIsAutoPlaying] = useState(true);

  useEffect(() => {
    if (!isAutoPlaying) return;

    const timer = setInterval(() => {
      setCurrentSlide(prev => (prev + 1) % leaderQuotes.length);
    }, 6000); // Change slide every 6 seconds

    return () => clearInterval(timer);
  }, [isAutoPlaying]);

  const nextSlide = () => {
    setCurrentSlide(prev => (prev + 1) % leaderQuotes.length);
    setIsAutoPlaying(false);
  };

  const prevSlide = () => {
    setCurrentSlide(prev => (prev - 1 + leaderQuotes.length) % leaderQuotes.length);
    setIsAutoPlaying(false);
  };

  const currentQuote = leaderQuotes[currentSlide];

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-gray-50">
      {/* Gradient Background - Matching header gradient (Red to Orange to Gold) */}
      {/* Extended to cover full section including top navigation area */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        {/* Gradient overlay */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to right, hsl(0, 72%, 36%) 0%, hsl(20, 90%, 55%) 50%, hsl(45, 100%, 51%) 100%)',
            opacity: 0.15
          }}
        />

        <svg
          className="absolute w-full h-full"
          viewBox="0 0 1440 900"
          preserveAspectRatio="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="heroGradient" x1="0%" y1="0%" x2="100%" y2="0%">
              <stop offset="0%" style={{ stopColor: '#9e1a1a', stopOpacity: 0.6 }} />
              <stop offset="50%" style={{ stopColor: '#F57C00', stopOpacity: 0.5 }} />
              <stop offset="100%" style={{ stopColor: '#FFC107', stopOpacity: 0.6 }} />
            </linearGradient>
          </defs>

          {/* Top Right Curve */}
          <path
            d="M1440 0V450C1300 400 1200 100 1000 0H1440Z"
            fill="url(#heroGradient)"
          />

          {/* Bottom Swoosh */}
          <path
            d="M0 900H1440V650C1100 800 800 750 400 880L0 900Z"
            fill="url(#heroGradient)"
          />
        </svg>
      </div>

      <div className="container mx-auto px-4 relative z-20 pt-[140px] md:pt-[120px] pb-12">
        <div className="grid lg:grid-cols-[1fr_1.2fr] gap-12 lg:gap-16 items-center">
          {/* Left Content - Quote */}
          <div className="space-y-8 text-left order-2 lg:order-1">
            <div key={currentSlide} className="animate-fade-in">
              {/* Quote Icon */}
              <Quote className="w-16 h-16 text-primary/20 mb-6" />

              {/* Quote Text */}
              <blockquote className="space-y-6">
                <p className="font-display text-2xl md:text-3xl lg:text-4xl font-bold leading-relaxed text-foreground italic">
                  "{currentQuote.quote}"
                </p>

                {/* Author Info */}
                <footer className="space-y-2">
                  <cite className="not-italic">
                    <div className="font-display text-xl md:text-2xl font-semibold text-primary">
                      — {currentQuote.name}
                    </div>
                    <div className="text-base md:text-lg text-muted-foreground">
                      {currentQuote.title}
                    </div>
                  </cite>
                </footer>
              </blockquote>
            </div>

            {/* Dots Indicator - Only show if multiple slides */}
            {leaderQuotes.length > 1 && (
              <div className="flex gap-3 pt-4">
                {leaderQuotes.map((_, index) => (
                  <button
                    key={index}
                    onClick={() => {
                      setCurrentSlide(index);
                      setIsAutoPlaying(false);
                    }}
                    className={cn(
                      'h-2 rounded-full transition-all duration-300',
                      index === currentSlide
                        ? 'w-12 bg-primary shadow-lg'
                        : 'w-2 bg-muted-foreground/40 hover:bg-muted-foreground/60'
                    )}
                    aria-label={`Go to slide ${index + 1}`}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Right Slider - Leader Images */}
          <div className="relative order-1 lg:order-2">
            <AnimatedBlobCard className="max-w-3xl mx-auto aspect-video">
              {leaderQuotes.map((leader, index) => {
                const isCurrent = index === currentSlide;
                const SlideContent = (
                  <div className="relative w-full h-full">
                    <img
                      src={leader.image}
                      alt={leader.name}
                      className={cn(
                        "w-full h-full object-cover transition-all duration-500"
                      )}
                    />
                    {/* Gradient Overlay */}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

                    {/* Name Badge at Bottom */}
                    <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-black/80 to-transparent">
                      <h3 className="font-display text-2xl md:text-3xl font-bold text-white">
                        {leader.name}
                      </h3>
                      <p className="text-sm md:text-base text-white/80">
                        {leader.title}
                      </p>
                    </div>
                  </div>
                );

                if (leader.link) {
                  return (
                    <Link
                      key={leader.id}
                      to={leader.link}
                      className={cn(
                        'absolute inset-0 transition-all duration-700 ease-in-out block',
                        isCurrent
                          ? 'opacity-100 scale-100 z-10'
                          : 'opacity-0 scale-105 z-0'
                      )}
                    >
                      {SlideContent}
                    </Link>
                  );
                }

                return (
                  <div
                    key={leader.id}
                    className={cn(
                      'absolute inset-0 transition-all duration-700 ease-in-out',
                      isCurrent
                        ? 'opacity-100 scale-100 z-10'
                        : 'opacity-0 scale-105 z-0'
                    )}
                  >
                    {SlideContent}
                  </div>
                );
              })}

              {/* Navigation Arrows */}
              {leaderQuotes.length > 1 && (
                <>
                  <button
                    onClick={prevSlide}
                    className="absolute left-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-lg flex items-center justify-center hover:bg-background hover:scale-110 transition-all"
                    aria-label="Previous slide"
                  >
                    <ChevronLeft className="w-5 h-5 text-foreground" />
                  </button>
                  <button
                    onClick={nextSlide}
                    className="absolute right-3 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full bg-background/80 backdrop-blur-sm border border-border shadow-lg flex items-center justify-center hover:bg-background hover:scale-110 transition-all"
                    aria-label="Next slide"
                  >
                    <ChevronRight className="w-5 h-5 text-foreground" />
                  </button>
                </>
              )}
            </AnimatedBlobCard>
          </div>
        </div>
      </div>
    </section>
  );
};