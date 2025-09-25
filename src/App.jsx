// src/App.jsx
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ConfigProvider } from 'antd';
import GoogleProvider from './components/GoogleProvider';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';

function App() {
  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: '#1890ff',
        },
      }}
    >
      <GoogleProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Layout />}>
              <Route index element={<Dashboard />} />
            </Route>
          </Routes>
        </Router>
      </GoogleProvider>
    </ConfigProvider>
  );
}

export default App;