// src/components/Layout.jsx
import { Outlet } from 'react-router-dom';
import { Layout as AntLayout, Typography } from 'antd';
import { MailOutlined } from '@ant-design/icons';

const { Header, Content, Footer } = AntLayout;
const { Title } = Typography;

export default function Layout() {
  return (
    <AntLayout style={{ minHeight: '100vh' }}>
      <Header style={{ background: '#fff', padding: '0 24px', display: 'flex', alignItems: 'center' }}>
        <MailOutlined style={{ fontSize: '24px', color: '#1890ff' }} />
        <Title level={4} style={{ margin: '0 0 0 12px' }}>
          Etsy Order Scanner
        </Title>
      </Header>

      <Content style={{ padding: '24px', maxWidth: '1200px', width: '100%', margin: '0 auto' }}>
        <Outlet />
      </Content>

      <Footer style={{ textAlign: 'center' }}>
        Built with React and Ant Design
      </Footer>
    </AntLayout>
  );
}