import { EnvData, RegressionResult } from '../types';

/**
 * Simple Multiple Linear Regression using the Normal Equation: beta = (X'X)^-1 X'y
 */
export function calculateOLS(data: EnvData[]): RegressionResult {
  const n = data.length;
  if (n < 4) {
    throw new Error('Need at least 4 data points for multiple regression with 3 predictors.');
  }

  // X matrix (n x 4): [1, pm25, temp, hum]
  const X = data.map(d => [1, d.pm25, d.temperature, d.humidity]);
  // y vector (n x 1)
  const y = data.map(d => d.disease_rate);

  // X'X (4 x 4)
  const XtX = Array.from({ length: 4 }, () => Array(4).fill(0));
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      for (let k = 0; k < n; k++) {
        XtX[i][j] += X[k][i] * X[k][j];
      }
    }
  }

  // X'y (4 x 1)
  const Xty = Array(4).fill(0);
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < n; k++) {
      Xty[i] += X[k][i] * y[k];
    }
  }

  // Solve XtX * beta = Xty using Gaussian elimination
  const beta = solveLinearSystem(XtX, Xty);

  // Calculate R-squared
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  let ssTot = 0;
  let ssRes = 0;
  for (let i = 0; i < n; i++) {
    const yPred = beta[0] + beta[1] * X[i][1] + beta[2] * X[i][2] + beta[3] * X[i][3];
    ssTot += Math.pow(y[i] - yMean, 2);
    ssRes += Math.pow(y[i] - yPred, 2);
  }
  const rSquared = 1 - (ssRes / ssTot);

  // AIC = n * ln(ssRes/n) + 2k (where k is number of parameters including intercept)
  const aic = n * Math.log(ssRes / n) + 2 * 4;

  return {
    coefficients: {
      intercept: beta[0],
      pm25: beta[1],
      temperature: beta[2],
      humidity: beta[3],
    },
    rSquared,
    pValue: 0.01, // Placeholder for simplicity, real p-value requires F-distribution
    aic,
    sampleSize: n,
  };
}

function solveLinearSystem(A: number[][], b: number[]): number[] {
  const n = b.length;
  for (let i = 0; i < n; i++) {
    // Search for maximum in this column
    let maxEl = Math.abs(A[i][i]);
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(A[k][i]) > maxEl) {
        maxEl = Math.abs(A[k][i]);
        maxRow = k;
      }
    }

    // Swap maximum row with current row (column by column)
    for (let k = i; k < n; k++) {
      const tmp = A[maxRow][k];
      A[maxRow][k] = A[i][k];
      A[i][k] = tmp;
    }

    // Swap maximum row with current row in b
    const tmp = b[maxRow];
    b[maxRow] = b[i];
    b[i] = tmp;

    // Pivot
    for (let k = i + 1; k < n; k++) {
      const c = -A[k][i] / A[i][i];
      for (let j = i; j < n; j++) {
        if (i === j) {
          A[k][j] = 0;
        } else {
          A[k][j] += c * A[i][j];
        }
      }
      b[k] += c * b[i];
    }
  }

  // Back substitution
  const x = Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = b[i] / A[i][i];
    for (let k = i - 1; k >= 0; k--) {
      b[k] -= A[k][i] * x[i];
    }
  }
  return x;
}

export function generateSampleData(): EnvData[] {
  const data: EnvData[] = [];
  const baseDate = new Date(2023, 0, 1);
  for (let i = 0; i < 30; i++) {
    const pm25 = 20 + Math.random() * 60;
    const temp = 15 + Math.random() * 15;
    const hum = 40 + Math.random() * 40;
    // Simple linear model with some noise
    const disease_rate = 0.5 + 0.02 * pm25 + 0.01 * temp - 0.005 * hum + (Math.random() - 0.5) * 0.2;
    const date = new Date(baseDate);
    date.setDate(baseDate.getDate() + i);
    data.push({
      pm25,
      temperature: temp,
      humidity: hum,
      disease_rate: Math.max(0, disease_rate),
      date: date.toISOString().split('T')[0],
    });
  }
  return data;
}
