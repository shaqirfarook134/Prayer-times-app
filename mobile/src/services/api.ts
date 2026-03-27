import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { Masjid, PrayerTimes, RegisterDeviceRequest, UpdateDeviceRequest } from '../types';

// Production API URL (with PostgreSQL database)
const API_BASE_URL = 'https://prayer-times-api-uddr.onrender.com/api/v1';

class ApiService {
  private client: AxiosInstance;
  private readonly MAX_RETRIES = 2;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000, // 10s timeout - faster failure for better UX
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add request interceptor for logging
    this.client.interceptors.request.use(
      (config) => {
        console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Add response interceptor for error handling
    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        if (error.response) {
          console.error('API Error:', error.response.data);
        } else if (error.request) {
          console.error('Network Error:', error.message);
        }
        return Promise.reject(error);
      }
    );
  }

  // Retry logic with exponential backoff
  // Only retries on network errors or 5xx server errors
  // Does NOT retry on 4xx client errors (like 404 Not Found)
  private async retryRequest<T>(
    requestFn: () => Promise<T>,
    retryCount = 0
  ): Promise<T> {
    try {
      return await requestFn();
    } catch (error: any) {
      // Check if this is a client error (4xx) - don't retry these
      const statusCode = error.response?.status;
      if (statusCode && statusCode >= 400 && statusCode < 500) {
        console.log(`Client error (${statusCode}) - not retrying`);
        throw error;
      }

      if (retryCount >= this.MAX_RETRIES) {
        console.error(`Max retries (${this.MAX_RETRIES}) reached, giving up`);
        throw error;
      }

      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.pow(2, retryCount) * 1000;
      console.log(`Request failed, retrying in ${delay}ms... (attempt ${retryCount + 1}/${this.MAX_RETRIES})`);

      await new Promise((resolve) => setTimeout(resolve, delay));
      return this.retryRequest(requestFn, retryCount + 1);
    }
  }

  // Masjid endpoints
  async getMasjids(): Promise<Masjid[]> {
    return this.retryRequest(async () => {
      const response = await this.client.get<Masjid[]>('/masjids');
      return response.data;
    });
  }

  async getMasjidById(id: number): Promise<Masjid> {
    return this.retryRequest(async () => {
      const response = await this.client.get<Masjid>(`/masjids/${id}`);
      return response.data;
    });
  }

  // Prayer times endpoints
  async getPrayerTimes(masjidId: number): Promise<PrayerTimes> {
    return this.retryRequest(async () => {
      const response = await this.client.get<PrayerTimes>(`/prayer-times/${masjidId}`);
      return response.data;
    });
  }

  async getPrayerTimesByDate(masjidId: number, date: string): Promise<PrayerTimes> {
    return this.retryRequest(async () => {
      const response = await this.client.get<PrayerTimes>(`/prayer-times/${masjidId}/${date}`);
      return response.data;
    });
  }

  // Device registration endpoints
  async registerDevice(data: RegisterDeviceRequest): Promise<void> {
    return this.retryRequest(async () => {
      await this.client.post('/devices/register', data);
    });
  }

  async updateDevicePreferences(token: string, data: UpdateDeviceRequest): Promise<void> {
    return this.retryRequest(async () => {
      await this.client.put(`/devices/preferences?token=${token}`, data);
    });
  }

  async unregisterDevice(token: string): Promise<void> {
    return this.retryRequest(async () => {
      await this.client.delete(`/devices/unregister?token=${token}`);
    });
  }
}

export default new ApiService();
