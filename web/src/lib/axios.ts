import axios, { AxiosError } from 'axios';
import { handleSignOut } from '@/lib/auth/logout';

interface ApiErrorResponse {
  message?: string;
  [key: string]: any;
}

const showToast = async (title: string, description: string) => {
  const { addToast } = await import('@heroui/react');
  addToast({
    title,
    description,
    color: 'danger',
  });
};

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.response.use(
  response => response,
  async (
    error: AxiosError<ApiErrorResponse> & {
      config?: { showErrorToast?: boolean };
    }
  ) => {
    const showError = error.config?.showErrorToast !== false;

    if (error.response?.status === 401) {
      if (showError) {
        await showToast('Error', 'Session expired. Please log in again');
      }
      await handleSignOut();
      return Promise.reject(error);
    }

    if (showError) {
      if (axios.isAxiosError(error)) {
        await showToast(
          'Error',
          error.response?.data?.message || 'Something went wrong'
        );
      } else {
        await showToast(
          'Network Error',
          'Unable to connect. Please try again.'
        );
      }
    }

    return Promise.reject(error);
  }
);

export const handleApiError = (
  error: unknown,
  addToast: (toast: {
    title: string;
    description: string;
    color: 'success' | 'danger' | 'warning' | 'default';
  }) => void
) => {
  if (axios.isAxiosError(error)) {
    addToast({
      title: 'Error',
      description: error.response?.data?.message || 'Something went wrong',
      color: 'danger',
    });
  } else {
    addToast({
      title: 'Network Error',
      description: 'Unable to connect. Please try again.',
      color: 'danger',
    });
  }
};

export default api;
