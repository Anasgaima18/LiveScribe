import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import logger from '../config/logger.js';
import path from 'path';

/**
 * Cloud Storage Service - Supports AWS S3, Azure Blob, Cloudinary
 * Configurable via environment variables
 */

class CloudStorageService {
  constructor() {
    this.provider = process.env.CLOUD_STORAGE_PROVIDER || 'aws'; // 'aws', 'azure', 'cloudinary'
    this.initializeClient();
  }

  initializeClient() {
    switch (this.provider) {
      case 'aws':
        this.initAWS();
        break;
      case 'azure':
        this.initAzure();
        break;
      case 'cloudinary':
        this.initCloudinary();
        break;
      default:
        logger.warn('No cloud storage provider configured');
    }
  }

  initAWS() {
    try {
      this.s3Client = new S3Client({
        region: process.env.AWS_REGION || 'us-east-1',
        credentials: {
          accessKeyId: process.env.AWS_ACCESS_KEY_ID,
          secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
        }
      });
      this.bucket = process.env.AWS_S3_BUCKET;
      logger.info('AWS S3 storage initialized');
    } catch (error) {
      logger.error('AWS S3 initialization failed:', error);
    }
  }

  initAzure() {
    try {
      // Azure Blob Storage initialization
      const { BlobServiceClient } = require('@azure/storage-blob');
      this.blobServiceClient = BlobServiceClient.fromConnectionString(
        process.env.AZURE_STORAGE_CONNECTION_STRING
      );
      this.containerName = process.env.AZURE_CONTAINER_NAME || 'recordings';
      logger.info('Azure Blob Storage initialized');
    } catch (error) {
      logger.error('Azure Blob Storage initialization failed:', error);
    }
  }

  initCloudinary() {
    try {
      const cloudinary = require('cloudinary').v2;
      cloudinary.config({
        cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
        api_key: process.env.CLOUDINARY_API_KEY,
        api_secret: process.env.CLOUDINARY_API_SECRET
      });
      this.cloudinary = cloudinary;
      logger.info('Cloudinary initialized');
    } catch (error) {
      logger.error('Cloudinary initialization failed:', error);
    }
  }

  /**
   * Upload file to cloud storage
   * @param {Buffer} fileBuffer - File buffer
   * @param {string} fileName - File name
   * @param {string} mimeType - MIME type
   * @returns {Promise<object>} - Upload result with URL
   */
  async uploadFile(fileBuffer, fileName, mimeType = 'video/webm') {
    try {
      switch (this.provider) {
        case 'aws':
          return await this.uploadToAWS(fileBuffer, fileName, mimeType);
        case 'azure':
          return await this.uploadToAzure(fileBuffer, fileName, mimeType);
        case 'cloudinary':
          return await this.uploadToCloudinary(fileBuffer, fileName);
        default:
          throw new Error('Cloud storage provider not configured');
      }
    } catch (error) {
      logger.error('File upload error:', error);
      throw error;
    }
  }

  async uploadToAWS(fileBuffer, fileName, mimeType) {
    const key = `recordings/${Date.now()}-${fileName}`;
    
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
      ACL: 'private'
    });

    await this.s3Client.send(command);

    // Generate signed URL for access
    const getCommand = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key
    });
    
    const signedUrl = await getSignedUrl(this.s3Client, getCommand, { expiresIn: 3600 * 24 * 7 }); // 7 days

    return {
      success: true,
      provider: 'aws',
      url: signedUrl,
      key: key,
      fileName: fileName,
      size: fileBuffer.length,
      uploadedAt: new Date()
    };
  }

  async uploadToAzure(fileBuffer, fileName, mimeType) {
    const blobName = `recordings/${Date.now()}-${fileName}`;
    const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);

    await blockBlobClient.uploadData(fileBuffer, {
      blobHTTPHeaders: { blobContentType: mimeType }
    });

    return {
      success: true,
      provider: 'azure',
      url: blockBlobClient.url,
      blobName: blobName,
      fileName: fileName,
      size: fileBuffer.length,
      uploadedAt: new Date()
    };
  }

  async uploadToCloudinary(fileBuffer, fileName) {
    return new Promise((resolve, reject) => {
      const uploadStream = this.cloudinary.uploader.upload_stream(
        {
          resource_type: 'video',
          folder: 'call-recordings',
          public_id: `${Date.now()}-${path.parse(fileName).name}`,
          format: 'mp4'
        },
        (error, result) => {
          if (error) {
            reject(error);
          } else {
            resolve({
              success: true,
              provider: 'cloudinary',
              url: result.secure_url,
              publicId: result.public_id,
              fileName: fileName,
              size: result.bytes,
              duration: result.duration,
              uploadedAt: new Date()
            });
          }
        }
      );

      uploadStream.end(fileBuffer);
    });
  }

  /**
   * Delete file from cloud storage
   * @param {string} fileKey - File key/identifier
   * @returns {Promise<boolean>} - Success status
   */
  async deleteFile(fileKey) {
    try {
      switch (this.provider) {
        case 'aws':
          return await this.deleteFromAWS(fileKey);
        case 'azure':
          return await this.deleteFromAzure(fileKey);
        case 'cloudinary':
          return await this.deleteFromCloudinary(fileKey);
        default:
          throw new Error('Cloud storage provider not configured');
      }
    } catch (error) {
      logger.error('File deletion error:', error);
      throw error;
    }
  }

  async deleteFromAWS(key) {
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key
    });

    await this.s3Client.send(command);
    return true;
  }

  async deleteFromAzure(blobName) {
    const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
    const blockBlobClient = containerClient.getBlockBlobClient(blobName);
    await blockBlobClient.delete();
    return true;
  }

  async deleteFromCloudinary(publicId) {
    await this.cloudinary.uploader.destroy(publicId, { resource_type: 'video' });
    return true;
  }

  /**
   * Get signed URL for temporary access
   * @param {string} fileKey - File key/identifier
   * @param {number} expiresIn - Expiration time in seconds
   * @returns {Promise<string>} - Signed URL
   */
  async getSignedUrl(fileKey, expiresIn = 3600) {
    try {
      if (this.provider === 'aws') {
        const command = new GetObjectCommand({
          Bucket: this.bucket,
          Key: fileKey
        });
        return await getSignedUrl(this.s3Client, command, { expiresIn });
      }
      
      // Azure and Cloudinary URLs are already accessible
      return fileKey; // Return the URL directly
    } catch (error) {
      logger.error('Get signed URL error:', error);
      throw error;
    }
  }
}

// Singleton instance
const cloudStorage = new CloudStorageService();

export default cloudStorage;

export const uploadRecording = async (fileBuffer, fileName, mimeType) => {
  return await cloudStorage.uploadFile(fileBuffer, fileName, mimeType);
};

export const deleteRecording = async (fileKey) => {
  return await cloudStorage.deleteFile(fileKey);
};

export const getRecordingUrl = async (fileKey, expiresIn) => {
  return await cloudStorage.getSignedUrl(fileKey, expiresIn);
};
