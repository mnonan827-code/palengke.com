// Cloudinary Uploader Utility
class CloudinaryUploader {
    constructor(config) {
      this.cloudName = config.cloudName;
      this.uploadPreset = config.uploadPreset;
      this.uploadUrl = `https://api.cloudinary.com/v1_1/${this.cloudName}/image/upload`;
    }
  
    // Upload image to Cloudinary
    async uploadImage(file) {
      return new Promise((resolve, reject) => {
        if (!file) {
          reject(new Error('No file provided'));
          return;
        }
  
        // Validate file type
        const validTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!validTypes.includes(file.type)) {
          reject(new Error('Invalid file type. Please upload JPEG, PNG, GIF, or WebP images.'));
          return;
        }
  
        // Validate file size (5MB max)
        const maxSize = 5 * 1024 * 1024; // 5MB in bytes
        if (file.size > maxSize) {
          reject(new Error('File size too large. Maximum size is 5MB.'));
          return;
        }
  
        const formData = new FormData();
        formData.append('file', file);
        formData.append('upload_preset', this.uploadPreset);
        formData.append('folder', 'palengke-products');
        formData.append('tags', 'palengke,marketplace,food');
  
        // Show upload progress
        const xhr = new XMLHttpRequest();
        
        xhr.upload.addEventListener('progress', (e) => {
          if (e.lengthComputable) {
            const percentComplete = (e.loaded / e.total) * 100;
            const progressBar = document.getElementById('upload-progress-bar');
            if (progressBar) {
              progressBar.style.width = percentComplete + '%';
            }
          }
        });
  
        xhr.addEventListener('load', () => {
          if (xhr.status === 200) {
            const data = JSON.parse(xhr.responseText);
            resolve({
              url: data.secure_url,
              publicId: data.public_id,
              width: data.width,
              height: data.height,
              format: data.format
            });
          } else {
            reject(new Error('Upload failed: ' + xhr.statusText));
          }
        });
  
        xhr.addEventListener('error', () => {
          reject(new Error('Upload failed. Please check your connection.'));
        });
  
        xhr.open('POST', this.uploadUrl);
        xhr.send(formData);
      });
    }
  
    // Generate responsive image URL with transformations
    generateImageUrl(publicId, transformations = {}) {
      const baseUrl = `https://res.cloudinary.com/${this.cloudName}/image/upload`;
      const transformString = this.buildTransformString(transformations);
      return transformString ? `${baseUrl}/${transformString}/${publicId}` : `${baseUrl}/${publicId}`;
    }
  
    // Build transformation string for Cloudinary URL
    buildTransformString(transformations) {
      const transforms = [];
      
      if (transformations.width) transforms.push(`w_${transformations.width}`);
      if (transformations.height) transforms.push(`h_${transformations.height}`);
      if (transformations.crop) transforms.push(`c_${transformations.crop}`);
      if (transformations.quality) transforms.push(`q_${transformations.quality}`);
      if (transformations.format) transforms.push(`f_${transformations.format}`);
      
      return transforms.join(',');
    }
  
    // Optimize image for web display
    getOptimizedImageUrl(publicId, width = 600, height = 400) {
      return this.generateImageUrl(publicId, {
        width: width,
        height: height,
        crop: 'fill',
        quality: 'auto',
        format: 'auto'
      });
    }
  
    // Get thumbnail URL
    getThumbnailUrl(publicId, size = 200) {
      return this.generateImageUrl(publicId, {
        width: size,
        height: size,
        crop: 'fill',
        quality: 'auto',
        format: 'auto'
      });
    }
  }
  
  // Create global instance
  let cloudinaryInstance = null;
  
  function initializeCloudinary(config) {
    if (!cloudinaryInstance) {
      cloudinaryInstance = new CloudinaryUploader(config);
      window.cloudinaryUploader = cloudinaryInstance;
    }
    return cloudinaryInstance;
  }
  
  export { CloudinaryUploader, initializeCloudinary };
  export default CloudinaryUploader;