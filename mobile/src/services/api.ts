import axios, { AxiosInstance } from 'axios';
import { Masjid, PrayerTimes, RegisterDeviceRequest, UpdateDeviceRequest } from '../types';

// Production API URL (with PostgreSQL database)
const API_BASE_URL = 'https://prayer-times-api-uddr.onrender.com/api/v1';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 10000,
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

  // Masjid endpoints
  async getMasjids(): Promise<Masjid[]> {
    const response = await this.client.get<Masjid[]>('/masjids');
    return response.data;
  }

  async getMasjidById(id: number): Promise<Masjid> {
    const response = await this.client.get<Masjid>(`/masjids/${id}`);
    return response.data;
  }

  // Prayer times endpoints
  async getPrayerTimes(masjidId: number): Promise<PrayerTimes> {
    const response = await this.client.get<PrayerTimes>(`/prayer-times/${masjidId}`);
    return response.data;
  }

  async getPrayerTimesByDate(masjidId: number, date: string): Promise<PrayerTimes> {
    const response = await this.client.get<PrayerTimes>(`/prayer-times/${masjidId}/${date}`);
    return response.data;
  }

  // Device registration endpoints
  async registerDevice(data: RegisterDeviceRequest): Promise<void> {
    await this.client.post('/devices/register', data);
  }

  async updateDevicePreferences(token: string, data: UpdateDeviceRequest): Promise<void> {
    await this.client.put(`/devices/preferences?token=${token}`, data);
  }

  async unregisterDevice(token: string): Promise<void> {
    await this.client.delete(`/devices/unregister?token=${token}`);
  }
}

export default new ApiService();
