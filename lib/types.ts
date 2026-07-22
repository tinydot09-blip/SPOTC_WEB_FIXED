export type BusinessListing = {
  id: string;
  [key: string]: unknown;
  business_name?: string; shop_name?: string; creator_name?: string;
  logo_url?: string; business_logo_url?: string; business_logo?: string;
  category?: string; address?: string; businessAddress?: string;
  isActive?: boolean; isVerified?: boolean; is_business_verified?: boolean;
  verification_status?: string; playback_url?: string; business_video_url?: string;
  playback_480_url?: string; playback_720_url?: string; hls_master_url?: string;
  thumbnail_url?: string; processing_status?: string; created_at?: unknown;
  offer_text?: string; offer?: string; caption?: string; offer_end_text?: string;
  offer_end_at?: unknown; open_status?: string; business_status?: string; is_open?: boolean;
  road_distance_text?: string; distance_text?: string; views?: number; views_count?: number;
  likes?: number; likes_count?: number; phone?: string; business_phone?: string;
  contact_number?: string; whatsapp?: string; whatsapp_number?: string; product_name?: string;
};

export type BusinessProduct = {
  id: string; [key: string]: unknown;
  title?: string; product_name?: string; brand?: string; description?: string;
  images?: string[]; product_thumbnail?: string; image?: string; image_url?: string;
  image1?: string; price?: number; offer_price?: number; old_price?: number; mrp?: number;
  original_price?: number; discount?: number; discount_percent?: number;
  isActive?: boolean; is_in_stock?: boolean; stock_qty?: number; stock_quantity?: number;
  main_category?: string; sub_category?: string; category?: string;
  color?: string; size?: string; variant?: string; business_name?: string;
  business_ref?: unknown; owner_uid?: string; created_at?: unknown;
};

export type SpotItem = {
  id: string;
  [key: string]: unknown;

  creator_name?: string;
  creator_uid?: string;
  username?: string;
  display_name?: string;

  creator_photo_url?: string;
  profile_photo_url?: string;
  creator_photo?: string;
  photoUrl?: string;

  thumbnail?: string;
  thumbnail_url?: string;

  status?: string;
  processing_status?: string;

  playback_url?: string;
  playback_480_url?: string;
  playback_720_url?: string;
  hls_master_url?: string;
  video_url?: string;

  caption?: string;
  description?: string;
  music_name?: string;
  location_name?: string;
  district_name?: string;
  category?: string;
  created_at?: unknown;

  likes?: number;
  likes_count?: number;
  comments_count?: number;
  shares_count?: number;
  views?: number;
  views_count?: number;

  isVerified?: boolean;
  is_verified?: boolean;

  location?: unknown;
  capturedLocation?: unknown;
  captured_location?: unknown;
  spot_location?: unknown;

  unlock_required?: boolean;
  unlock_distance_km?: number;
  required_km?: number;
  unlock_count?: number;

  unlocked_by?: unknown[];
  unlocked_user_uids?: string[];
};
