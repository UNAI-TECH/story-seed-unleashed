import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  Carousel, 
  CarouselContent, 
  CarouselItem, 
  CarouselNext, 
  CarouselPrevious 
} from '@/components/ui/carousel';
import Autoplay from 'embla-carousel-autoplay';
import { supabase, getSafeImageUrl } from '@/integrations/supabase/client';
import { ArrowRight } from 'lucide-react';

interface StorageImage {
  id: string;
  url: string;
}

export const GalleryCarousel = () => {
  const [images, setImages] = useState<StorageImage[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const fallbackItems: StorageImage[] = [
    {
      id: 'fallback-1',
      url: '/assets/mercury-school.JPG',
    },
    {
      id: 'fallback-2',
      url: 'https://images.unsplash.com/photo-1503676260728-1c00da094a0b?auto=format&fit=crop&q=80',
    },
    {
      id: 'fallback-3',
      url: 'https://images.unsplash.com/photo-1523580494863-6f3031224c94?auto=format&fit=crop&q=80',
    }
  ];

  useEffect(() => {
    const fetchStorageImages = async () => {
      try {
        // Fetch only from event-activity-images bucket (activities folder)
        const { data: activityData, error: activityError } = await supabase.storage
          .from('event-activity-images')
          .list('activities', { limit: 100 });

        if (activityError) console.error('Activity storage error:', activityError);

        const allImages: StorageImage[] = [];

        if (activityData) {
          activityData.filter(f => f.name !== '.emptyFolderPlaceholder').forEach(file => {
            const { data: { publicUrl } } = supabase.storage
              .from('event-activity-images')
              .getPublicUrl(`activities/${file.name}`);
            allImages.push({ id: `activity-${file.name}`, url: publicUrl });
          });
        }

        if (allImages.length > 0) {
          // Shuffle combined images
          setImages(allImages.sort(() => Math.random() - 0.5));
        } else {
          setImages(fallbackItems);
        }
      } catch (error) {
        console.error('Error fetching storage images:', error);
        setImages(fallbackItems);
      } finally {
        setLoading(false);
      }
    };

    fetchStorageImages();
  }, []);

  if (loading) {
    return (
      <div className="py-20 flex justify-center">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }


  return (
    <section className="py-20 bg-background/50 relative overflow-hidden">
      {/* Background Decorative Gradients */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden pointer-events-none">
        <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] bg-primary/5 rounded-full blur-[120px]" />
        <div className="absolute bottom-[-10%] left-[-10%] w-[40%] h-[40%] bg-secondary/10 rounded-full blur-[120px]" />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="flex flex-col md:flex-row md:items-end justify-between mb-12 gap-6">
          <div className="space-y-4">
            <h2 className="font-display text-4xl md:text-5xl font-bold text-foreground">
              Event <span className="text-gradient">Gallery</span>
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl">
              Capturing the magic and emotion of our storytelling community in action
            </p>
          </div>
          <button 
            onClick={() => navigate('/gallery')}
            className="group flex items-center gap-2 text-primary font-semibold hover:gap-3 transition-all"
          >
            Explore Full Gallery
            <ArrowRight className="w-5 h-5" />
          </button>
        </div>

        <Carousel
          opts={{
            align: "start",
            loop: true,
          }}
          plugins={[
            Autoplay({
              delay: 3000,
              stopOnInteraction: false,
            }),
          ]}
          className="w-full relative"
        >
          <CarouselContent className="-ml-4 md:-ml-6">
            {images.map((image) => (
              <CarouselItem key={image.id} className="pl-4 md:pl-6 basis-full sm:basis-1/2 lg:basis-1/3">
                <div 
                  onClick={() => navigate('/gallery')}
                  className="group cursor-pointer relative aspect-[4/3] rounded-3xl overflow-hidden animate-fade-in"
                >
                  {/* Image */}
                  <img
                    src={getSafeImageUrl(image.url)}
                    alt="Gallery item"
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                  />
                  
                  {/* Subtle Glassmorphism Overlay (no text) */}
                  <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                  
                  <div className="absolute inset-0 border-2 border-transparent group-hover:border-white/20 transition-all duration-300 rounded-3xl" />
                </div>
              </CarouselItem>
            ))}
          </CarouselContent>
          <div className="hidden md:block">
            <CarouselPrevious className="-left-14 bg-background/80 backdrop-blur-sm border-primary/20 hover:bg-primary hover:text-white" />
            <CarouselNext className="-right-14 bg-background/80 backdrop-blur-sm border-primary/20 hover:bg-primary hover:text-white" />
          </div>
        </Carousel>
      </div>
    </section>
  );
};
