// API Configuration
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Helper function to get full API endpoint
export const getApiUrl = (path) => {
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  return `${API_URL}/${cleanPath}`;
};

// Helper for asset URLs (avatars, uploads)
export const getAssetUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  return `${API_URL}${path}`;
};
