import { HeroSection } from '@/components/home/HeroSection';
import { EventsSection } from '@/components/home/EventsSection';
import { GalleryCarousel } from '@/components/home/GalleryCarousel';
import { HowItWorksSection } from '@/components/home/HowItWorksSection';
import { PartnersSection } from '@/components/home/PartnersSection';
import { NewsletterSection } from '@/components/home/NewsletterSection';

const Index = () => {
  return (
    <div className="page-enter">
      <HeroSection />
      <EventsSection />
      <GalleryCarousel />
      <HowItWorksSection />
      <PartnersSection />
      <NewsletterSection />
    </div>
  );
};

export default Index;
