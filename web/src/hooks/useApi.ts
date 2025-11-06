// hooks/useApi.ts
import { useState } from 'react';
import axios, { AxiosRequestConfig, AxiosResponse } from 'axios';

import { api, handleApiError } from '@/lib/axios';

interface UseApiOptions {
  addToast?: (toast: {
    title: string;
    description: string;
    color: 'success' | 'danger' | 'warning' | 'default';
  }) => void;
  showSuccessToast?: boolean; // Auto show toast on success (default: true)
  successMessage?: string; // Override success message
  onSuccess?: (data: any, response: AxiosResponse) => void;
  onError?: (error: unknown, status?: number) => void;

  // 2XX Success handlers
  on200?: (data: any, response: AxiosResponse) => void; // OK
  on201?: (data: any, response: AxiosResponse) => void; // Created
  on202?: (data: any, response: AxiosResponse) => void; // Accepted
  on204?: (data: any, response: AxiosResponse) => void; // No Content

  // 4XX Client Error handlers
  on400?: (error: unknown) => void; // Bad Request
  on401?: (error: unknown) => void; // Unauthorized (also handled by interceptor)
  on403?: (error: unknown) => void; // Forbidden
  on404?: (error: unknown) => void; // Not Found
  on409?: (error: unknown) => void; // Conflict
  on422?: (error: unknown) => void; // Unprocessable Entity
  on429?: (error: unknown) => void; // Too Many Requests

  // 5XX Server Error handlers
  on500?: (error: unknown) => void; // Internal Server Error
  on502?: (error: unknown) => void; // Bad Gateway
  on503?: (error: unknown) => void; // Service Unavailable
  on504?: (error: unknown) => void; // Gateway Timeout
}

export function useApi(options: UseApiOptions = {}) {
  const [isLoading, setIsLoading] = useState(false);
  const {
    addToast,
    showSuccessToast = true,
    successMessage,
    onSuccess,
    onError,
    on200,
    on201,
    on202,
    on204,
    on400,
    on401,
    on403,
    on404,
    on409,
    on422,
    on429,
    on500,
    on502,
    on503,
    on504,
  } = options;

  const handleSuccess = (response: AxiosResponse) => {
    const status = response.status;

    // Handle specific 2XX status codes
    switch (status) {
      case 200:
        on200?.(response.data, response);
        break;
      case 201:
        on201?.(response.data, response);
        break;
      case 202:
        on202?.(response.data, response);
        break;
      case 204:
        on204?.(response.data, response);
        break;
    }

    // Show success toast
    if (showSuccessToast && addToast) {
      const message =
        successMessage ||
        response.data?.message ||
        response.data?.success ||
        'Operation completed successfully!';

      addToast({
        title: 'Success!',
        description: message,
        color: 'success',
      });
    }

    // Call general success handler
    onSuccess?.(response.data, response);
  };

  const handleError = (error: unknown) => {
    if (axios.isAxiosError(error)) {
      const status = error.response?.status;

      // Handle specific error status codes
      switch (status) {
        case 400:
          on400?.(error);
          break;
        case 401:
          on401?.(error);
          break;
        case 403:
          on403?.(error);
          break;
        case 404:
          on404?.(error);
          break;
        case 409:
          on409?.(error);
          break;
        case 422:
          on422?.(error);
          break;
        case 429:
          on429?.(error);
          break;
        case 500:
          on500?.(error);
          break;
        case 502:
          on502?.(error);
          break;
        case 503:
          on503?.(error);
          break;
        case 504:
          on504?.(error);
          break;
      }

      if (status !== 401 && addToast) {
        handleApiError(error, addToast);
      }

      onError?.(error, status);
    } else {
      // Handle network or other errors
      if (addToast) {
        handleApiError(error, addToast);
      }
      onError?.(error);
    }
  };

  const get = async (url: string, config?: AxiosRequestConfig) => {
    setIsLoading(true);
    try {
      const response = await api.get(url, config);

      handleSuccess(response);

      return response.data;
    } catch (error) {
      handleError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // POST request
  const post = async (url: string, data?: any, config?: AxiosRequestConfig) => {
    setIsLoading(true);
    try {
      const response = await api.post(url, data, config);

      handleSuccess(response);

      return response.data;
    } catch (error) {
      // handleError(error);
      // throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // PUT request
  const put = async (url: string, data?: any, config?: AxiosRequestConfig) => {
    setIsLoading(true);
    try {
      const response = await api.put(url, data, config);

      handleSuccess(response);

      return response.data;
    } catch (error) {
      // handleError(error);
      // throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // PATCH request
  const patch = async (
    url: string,
    data?: any,
    config?: AxiosRequestConfig
  ) => {
    setIsLoading(true);
    try {
      const response = await api.patch(url, data, config);

      handleSuccess(response);

      return response.data;
    } catch (error) {
      // handleError(error);
      // throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // DELETE request
  const del = async (url: string, config?: AxiosRequestConfig) => {
    setIsLoading(true);
    try {
      const response = await api.delete(url, config);

      handleSuccess(response);

      return response.data;
    } catch (error) {
      // handleError(error);
      // throw error;
    } finally {
      setIsLoading(false);
    }
  };

  return {
    get,
    post,
    put,
    patch,
    delete: del,
    isLoading,
  };
}
