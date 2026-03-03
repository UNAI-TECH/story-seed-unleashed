import { useState, useEffect } from 'react';
import { X, ArrowLeft, Star, Calendar, Users, Trophy, Award, Image as ImageIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase, getSafeImageUrl } from '@/integrations/supabase/client';


const galleryCategories = ['All', 'Events', 'Performers', 'Sessions', 'Awards'];

interface GalleryItem {
  id: string;
  title: string;
  category: string;
  image_url: string;
  event_date: string | null;
  participants: number | null;
  featured: boolean;
  description: string | null;
  event_images: string[] | null;
}

const Gallery = () => {
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null);
  const [galleryItems, setGalleryItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchGalleryItems = async () => {
    try {
      const { data, error } = await supabase
        .from('gallery_images')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setGalleryItems(data || []);
    } catch (error) {
      console.error('Error fetching gallery items:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGalleryItems();

    const channel = supabase
      .channel('gallery-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gallery_images' }, fetchGalleryItems)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const filteredItems =
    activeCategory === 'All'
      ? galleryItems
      : galleryItems.filter((item) => item.category === activeCategory);

  const handleItemClick = (item: GalleryItem) => {
    setSelectedItem(item);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleBack = () => {
    setSelectedItem(null);
  };

  // Blog-style post view
  if (selectedItem) {
    return (
      <div className="page-enter">
        <article className="bg-background">
          {/* Header Image */}
          <div className="relative h-[60vh] min-h-[400px] overflow-hidden">
            <img
              src={getSafeImageUrl(selectedItem.image_url)}
              alt={selectedItem.title}
              className="w-full h-full object-cover"
            />

            <div className="absolute inset-0 bg-gradient-to-t from-charcoal/90 via-charcoal/50 to-transparent" />

            {/* Back Button */}
            <button
              onClick={handleBack}
              className="absolute top-6 left-6 z-10 flex items-center gap-2 px-4 py-2 bg-background/90 backdrop-blur-sm rounded-lg hover:bg-background transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
              <span>Back to Gallery</span>
            </button>

            {/* Featured Badge */}
            {selectedItem.featured && (
              <div className="absolute top-6 right-6 z-10">
                <span className="px-4 py-2 bg-secondary text-secondary-foreground text-sm font-semibold rounded-full flex items-center gap-2">
                  <Star className="w-4 h-4" />
                  Featured
                </span>
              </div>
            )}

            {/* Title Overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-8 md:p-12">
              <div className="container mx-auto max-w-4xl">
                <div className="flex items-center gap-4 text-white/80 text-sm mb-4">
                  {selectedItem.event_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-4 h-4" />
                      {selectedItem.event_date}
                    </span>
                  )}
                  {selectedItem.participants && (
                    <span className="flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {selectedItem.participants} Participants
                    </span>
                  )}
                  <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs">
                    {selectedItem.category}
                  </span>
                </div>
                <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-white">
                  {selectedItem.title}
                </h1>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="container mx-auto px-4 max-w-4xl py-12">
            {selectedItem.description && (
              <div className="prose prose-lg max-w-none mb-12">
                <p className="text-muted-foreground text-lg leading-relaxed">
                  {selectedItem.description}
                </p>
              </div>
            )}

            {/* Event Activity Images */}
            {selectedItem.event_images && selectedItem.event_images.length > 0 && (
              <div className="mt-12">
                <h2 className="font-display text-2xl font-semibold text-foreground mb-6 flex items-center gap-2">
                  <ImageIcon className="w-6 h-6 text-primary" />
                  Event Highlights
                </h2>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {selectedItem.event_images.map((img, idx) => (
                    <div
                      key={idx}
                      className="relative aspect-[4/3] rounded-xl overflow-hidden group cursor-pointer"
                    >
                      <img
                        src={getSafeImageUrl(img)}
                        alt={`${selectedItem.title} - Activity ${idx + 1}`}
                        className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                      />

                      <div className="absolute inset-0 bg-charcoal/0 group-hover:bg-charcoal/30 transition-colors" />
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </article>
      </div>
    );
  }

  // Gallery grid view
  return (
    <div className="page-enter">
      {/* Hero Banner */}
      <section className="relative py-16 sm:py-24 bg-gradient-to-br from-[#9B1B1B] via-[#FF6B35] to-[#D4AF37] overflow-hidden">
        {/* Decorative Pattern Overlay */}
        <div className="absolute inset-0 opacity-10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.15)_1px,transparent_0)] [background-size:40px_40px]"></div>
        </div>

        {/* Decorative Elements */}
        <div className="absolute top-10 right-10 w-32 h-32 bg-white/10 rounded-full blur-3xl"></div>
        <div className="absolute bottom-10 left-10 w-40 h-40 bg-[#D4AF37]/20 rounded-full blur-3xl"></div>

        <div className="container mx-auto px-4 text-center relative z-10">
          <h1 className="font-display text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-4 drop-shadow-lg">
            Our <span className="text-[#D4AF37]">Gallery</span>
          </h1>
          <p className="text-white/90 text-lg md:text-xl max-w-2xl mx-auto drop-shadow-md">
            Explore moments from our events, celebrate our star performers, and relive the magic of storytelling
          </p>
        </div>
      </section>

      {/* Category Filter */}
      <section className="py-8 bg-background sticky top-16 z-30 border-b border-border backdrop-blur-sm bg-background/95">
        <div className="container mx-auto px-4">
          <div className="flex flex-wrap justify-center gap-2">
            {galleryCategories.map((category) => (
              <button
                key={category}
                onClick={() => setActiveCategory(category)}
                className={cn(
                  'px-6 py-2.5 rounded-full font-medium text-sm transition-all duration-300',
                  activeCategory === category
                    ? 'bg-gradient-to-r from-[#9B1B1B] via-[#FF6B35] to-[#D4AF37] text-white shadow-lg'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {category}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Gallery Grid */}
      <section className="py-12 bg-background">
        <div className="container mx-auto px-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <ImageIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">No gallery items found.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredItems.map((item, index) => (
                <div
                  key={item.id}
                  onClick={() => handleItemClick(item)}
                  className="group relative bg-card rounded-2xl overflow-hidden cursor-pointer card-hover border border-border/50 animate-fade-in"
                  style={{ animationDelay: `${index * 0.1}s` }}
                >
                  {/* Image */}
                  <div className="relative aspect-[4/3] overflow-hidden">
                    <img
                      src={getSafeImageUrl(item.image_url)}
                      alt={item.title}
                      className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110"
                    />

                    <div className="absolute inset-0 bg-gradient-to-t from-charcoal/90 via-charcoal/40 to-transparent" />

                    {/* Featured Badge */}
                    {item.featured && (
                      <div className="absolute top-4 left-4 z-10">
                        <span className="px-3 py-1 bg-secondary text-secondary-foreground text-xs font-semibold rounded-full flex items-center gap-1 shadow-lg">
                          <Star className="w-3 h-3" />
                          Featured
                        </span>
                      </div>
                    )}

                    {/* Category Badge */}
                    <div className="absolute top-4 right-4 z-10">
                      <span className="px-3 py-1 bg-background/90 backdrop-blur-sm text-foreground text-xs font-semibold rounded-full">
                        {item.category}
                      </span>
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-6 space-y-3">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      {item.event_date && (
                        <>
                          <Calendar className="w-3 h-3" />
                          <span>{item.event_date}</span>
                        </>
                      )}
                      {item.participants && (
                        <>
                          <span>•</span>
                          <Users className="w-3 h-3" />
                          <span>{item.participants}</span>
                        </>
                      )}
                    </div>
                    <h3 className="font-display text-lg font-semibold text-foreground group-hover:text-primary transition-colors line-clamp-2">
                      {item.title}
                    </h3>
                    {item.description && (
                      <p className="text-muted-foreground text-sm line-clamp-2">
                        {item.description}
                      </p>
                    )}
                    <div className="pt-2 flex items-center text-primary text-sm font-medium group-hover:gap-2 transition-all">
                      View Details
                      <span className="transition-transform group-hover:translate-x-1">→</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>
    </div>
  );
};

export default Gallery;
