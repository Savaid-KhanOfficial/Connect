// API Configuration
// In production, this will be empty string to use relative URLs through nginx proxy
// In development, it points to localhost:3000
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

// Socket.IO URL - use window.location.origin in production for nginx proxy
export const SOCKET_URL = import.meta.env.VITE_API_URL 
  ? import.meta.env.VITE_API_URL 
  : (import.meta.env.PROD ? window.location.origin : 'http://localhost:3000');

// Helper function to get full API endpoint
export const getApiUrl = (path) => {
  // Remove leading slash if present
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  
  // If API_URL is empty, use relative path (for nginx proxy)
  if (!API_URL || API_URL === window.location.origin) {
    return `/${cleanPath}`;
  }
  
  return `${API_URL}/${cleanPath}`;
};

// Helper for asset URLs (avatars, uploads)
export const getAssetUrl = (path) => {
  if (!path) return null;
  if (path.startsWith('http')) return path;
  if (path.startsWith('data:')) return path;
  
  // If API_URL is empty, use relative path
  if (!API_URL || API_URL === window.location.origin) {
    return path;
  }
  
  return `${API_URL}${path}`;
};
