import { createRoot } from 'react-dom/client';
import './styles/index.css';

import App from './App';
import { ErrorBoundary } from './components/ErrorBoundary';
import { QueryProvider } from './providers/QueryProvider';
import { AuthProvider } from './components/AuthProvider';
import { ThemeProvider } from './contexts/ThemeContext';
import 'flowbite';
import { initWebVitals } from './utils/webVitals';
const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

const root = createRoot(container);

root.render(
  <ErrorBoundary>
    <QueryProvider>
      <ThemeProvider>
        <AuthProvider>
          <App />
        </AuthProvider>
      </ThemeProvider>
    </QueryProvider>
  </ErrorBoundary>
);

// ✅ Web Vitals 모니터링 시작
if (typeof window !== 'undefined') {
  initWebVitals();
}
