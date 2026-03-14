export interface EnvData {
  pm25: number;
  temperature: number;
  humidity: number;
  disease_rate: number;
  date?: string;
}

export interface RegressionResult {
  coefficients: {
    intercept: number;
    pm25: number;
    temperature: number;
    humidity: number;
  };
  rSquared: number;
  pValue: number; // Simplified overall p-value
  aic: number;
  sampleSize: number;
}

export type AppMode = 'researcher' | 'public';

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  thought?: string;
}
