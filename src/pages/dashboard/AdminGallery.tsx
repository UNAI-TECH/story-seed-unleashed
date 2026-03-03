import { useState, useEffect, useRef } from 'react';
import { Plus, Trash2, Edit2, Image as ImageIcon, Upload, X, Star, Calendar, Users, Images } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase, getSafeImageUrl } from '@/integrations/supabase/client';
import { toast } from 'sonner';


const categories = ['Events', 'Performers', 'Sessions', 'Awards'];

interface GalleryItem {
  id: string;
  title: string;
  description: string | null;
  category: string;
  image_url: string;
  event_date: string | null;
  participants: number | null;
  featured: boolean;
  created_at: string;
  event_images: string[] | null;
}

const AdminGallery = () => {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<GalleryItem | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadingEventImages, setUploadingEventImages] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const eventImagesInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    title: '',
    description: '',
    category: 'Events',
    image_url: '',
    event_date: '',
    participants: '',
    featured: false,
    event_images: [] as string[],
  });

  const fetchItems = async () => {
    try {
      const { data, error } = await supabase
        .from('gallery_images')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setItems(data || []);
    } catch (error) {
      console.error('Error fetching gallery items:', error);
      toast.error('Failed to load gallery items');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchItems();

    const channel = supabase
      .channel('admin-gallery')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'gallery_images' }, fetchItems)
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}.${fileExt}`;
      const filePath = `gallery/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('gallery-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('gallery-images')
        .getPublicUrl(filePath);

      setFormData(prev => ({ ...prev, image_url: publicUrl }));
      toast.success('Thumbnail uploaded successfully');
    } catch (error) {
      console.error('Error uploading image:', error);
      toast.error('Failed to upload image');
    } finally {
      setUploading(false);
    }
  };

  const handleEventImagesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setUploadingEventImages(true);
    const uploadedUrls: string[] = [];

    try {
      for (const file of Array.from(files)) {
        const fileExt = file.name.split('.').pop();
        const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
        const filePath = `activities/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('event-activity-images')
          .upload(filePath, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from('event-activity-images')
          .getPublicUrl(filePath);

        uploadedUrls.push(publicUrl);
      }

      setFormData(prev => ({
        ...prev,
        event_images: [...prev.event_images, ...uploadedUrls],
      }));
      toast.success(`${uploadedUrls.length} event image(s) uploaded`);
    } catch (error) {
      console.error('Error uploading event images:', error);
      toast.error('Failed to upload some event images');
    } finally {
      setUploadingEventImages(false);
      if (eventImagesInputRef.current) {
        eventImagesInputRef.current.value = '';
      }
    }
  };

  const removeEventImage = (index: number) => {
    setFormData(prev => ({
      ...prev,
      event_images: prev.event_images.filter((_, i) => i !== index),
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!formData.title || !formData.image_url) {
      toast.error('Title and thumbnail image are required');
      return;
    }

    try {
      const payload = {
        title: formData.title,
        description: formData.description || null,
        category: formData.category,
        image_url: formData.image_url,
        event_date: formData.event_date || null,
        participants: formData.participants ? parseInt(formData.participants) : null,
        featured: formData.featured,
        event_images: formData.event_images,
      };

      if (editingItem) {
        const { error } = await supabase
          .from('gallery_images')
          .update(payload)
          .eq('id', editingItem.id);

        if (error) throw error;
        toast.success('Gallery item updated');
      } else {
        const { error } = await supabase
          .from('gallery_images')
          .insert(payload);

        if (error) throw error;
        toast.success('Gallery item added');
      }

      setDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error saving gallery item:', error);
      toast.error('Failed to save gallery item');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this item?')) return;

    try {
      const { error } = await supabase
        .from('gallery_images')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('Gallery item deleted');
    } catch (error) {
      console.error('Error deleting gallery item:', error);
      toast.error('Failed to delete gallery item');
    }
  };

  const handleEdit = (item: GalleryItem) => {
    setEditingItem(item);
    setFormData({
      title: item.title,
      description: item.description || '',
      category: item.category,
      image_url: item.image_url,
      event_date: item.event_date || '',
      participants: item.participants?.toString() || '',
      featured: item.featured,
      event_images: item.event_images || [],
    });
    setDialogOpen(true);
  };

  const resetForm = () => {
    setEditingItem(null);
    setFormData({
      title: '',
      description: '',
      category: 'Events',
      image_url: '',
      event_date: '',
      participants: '',
      featured: false,
      event_images: [],
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 page-enter">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold text-foreground">Manage Gallery</h1>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) resetForm(); }}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" />
              Add Image
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingItem ? 'Edit Gallery Item' : 'Add Gallery Item'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="title">Title *</Label>
                <Input
                  id="title"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  placeholder="Enter title"
                  required
                />
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Enter description"
                  rows={3}
                />
              </div>

              <div>
                <Label htmlFor="category">Category</Label>
                <Select
                  value={formData.category}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, category: value }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat} value={cat}>{cat}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Thumbnail Image Upload */}
              <div className="p-4 border border-border rounded-lg bg-muted/30">
                <Label className="flex items-center gap-2 mb-2">
                  <ImageIcon className="w-4 h-4" />
                  Thumbnail Image *
                </Label>
                <p className="text-xs text-muted-foreground mb-3">
                  Main image displayed in the gallery grid
                </p>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleImageUpload}
                  accept="image/*"
                  className="hidden"
                />
                {formData.image_url ? (
                  <div className="relative">
                    <img
                      src={getSafeImageUrl(formData.image_url)}
                      alt="Thumbnail Preview"
                      className="w-full h-40 object-cover rounded-lg"
                    />

                    <Button
                      type="button"
                      variant="destructive"
                      size="icon"
                      className="absolute top-2 right-2"
                      onClick={() => setFormData(prev => ({ ...prev, image_url: '' }))}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                  >
                    {uploading ? (
                      <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
                    ) : (
                      <Upload className="w-4 h-4 mr-2" />
                    )}
                    {uploading ? 'Uploading...' : 'Upload Thumbnail'}
                  </Button>
                )}
              </div>

              {/* Event Activity Images Upload */}
              <div className="p-4 border border-border rounded-lg bg-muted/30">
                <Label className="flex items-center gap-2 mb-2">
                  <Images className="w-4 h-4" />
                  Event Activity Images
                </Label>
                <p className="text-xs text-muted-foreground mb-3">
                  Additional images showing activities, awards, performances, etc.
                </p>
                <input
                  type="file"
                  ref={eventImagesInputRef}
                  onChange={handleEventImagesUpload}
                  accept="image/*"
                  multiple
                  className="hidden"
                />

                {formData.event_images.length > 0 && (
                  <div className="grid grid-cols-3 gap-2 mb-3">
                    {formData.event_images.map((url, index) => (
                      <div key={index} className="relative group">
                        <img
                          src={getSafeImageUrl(url)}
                          alt={`Event image ${index + 1}`}
                          className="w-full h-20 object-cover rounded-lg"
                        />

                        <Button
                          type="button"
                          variant="destructive"
                          size="icon"
                          className="absolute top-1 right-1 w-6 h-6 opacity-0 group-hover:opacity-100 transition-opacity"
                          onClick={() => removeEventImage(index)}
                        >
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}

                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => eventImagesInputRef.current?.click()}
                  disabled={uploadingEventImages}
                >
                  {uploadingEventImages ? (
                    <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin mr-2" />
                  ) : (
                    <Upload className="w-4 h-4 mr-2" />
                  )}
                  {uploadingEventImages ? 'Uploading...' : 'Upload Event Images'}
                </Button>
                {formData.event_images.length > 0 && (
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    {formData.event_images.length} image(s) added
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="event_date">Event Date</Label>
                  <Input
                    id="event_date"
                    value={formData.event_date}
                    onChange={(e) => setFormData(prev => ({ ...prev, event_date: e.target.value }))}
                    placeholder="e.g., July 15, 2024"
                  />
                </div>
                <div>
                  <Label htmlFor="participants">Participants</Label>
                  <Input
                    id="participants"
                    type="number"
                    value={formData.participants}
                    onChange={(e) => setFormData(prev => ({ ...prev, participants: e.target.value }))}
                    placeholder="e.g., 500"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  id="featured"
                  checked={formData.featured}
                  onCheckedChange={(checked) => setFormData(prev => ({ ...prev, featured: checked }))}
                />
                <Label htmlFor="featured">Featured</Label>
              </div>

              <div className="flex gap-2 pt-4">
                <Button type="button" variant="outline" className="flex-1" onClick={() => setDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" className="flex-1">
                  {editingItem ? 'Update' : 'Add'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {items.length === 0 ? (
        <div className="bg-card p-8 rounded-2xl border border-border/50 text-center">
          <ImageIcon className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <p className="text-muted-foreground">No gallery items yet. Add your first image!</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {items.map((item) => (
            <div key={item.id} className="bg-card rounded-2xl overflow-hidden border border-border/50">
              <div className="relative aspect-video">
                <img
                  src={getSafeImageUrl(item.image_url)}
                  alt={item.title}
                  className="w-full h-full object-cover"
                />

                {item.featured && (
                  <span className="absolute top-2 left-2 px-2 py-1 bg-secondary text-secondary-foreground text-xs font-semibold rounded-full flex items-center gap-1">
                    <Star className="w-3 h-3" />
                    Featured
                  </span>
                )}
                <span className="absolute top-2 right-2 px-2 py-1 bg-background/90 text-xs font-semibold rounded-full">
                  {item.category}
                </span>
                {item.event_images && item.event_images.length > 0 && (
                  <span className="absolute bottom-2 right-2 px-2 py-1 bg-primary text-primary-foreground text-xs font-semibold rounded-full flex items-center gap-1">
                    <Images className="w-3 h-3" />
                    +{item.event_images.length}
                  </span>
                )}
              </div>
              <div className="p-4 space-y-2">
                <h3 className="font-semibold text-foreground line-clamp-1">{item.title}</h3>
                <div className="flex items-center gap-3 text-xs text-muted-foreground">
                  {item.event_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {item.event_date}
                    </span>
                  )}
                  {item.participants && (
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {item.participants}
                    </span>
                  )}
                </div>
                <div className="flex gap-2 pt-2">
                  <Button variant="outline" size="sm" className="flex-1" onClick={() => handleEdit(item)}>
                    <Edit2 className="w-3 h-3 mr-1" />
                    Edit
                  </Button>
                  <Button variant="destructive" size="sm" onClick={() => handleDelete(item.id)}>
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default AdminGallery;