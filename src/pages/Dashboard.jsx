// src/pages/Dashboard.jsx
import { useState, useEffect } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import {
    Card,
    Button,
    Typography,
    Space,
    message,
    Progress,
    Statistic,
    notification,
    Modal,
    Tabs
} from 'antd';
import {
    SyncOutlined,
    LoginOutlined,
    LogoutOutlined,
    CheckCircleOutlined,
    InfoCircleOutlined,
    WarningOutlined
} from '@ant-design/icons';
import { APP_URL, GMAIL_SCOPES } from '../config/constants';
import { GmailService } from '../services/gmailService';
import { supabase } from '../config/supabase';
import ExportButton from '../components/ExportButton';
import ExportsTab from '../components/ExportsTab';
import OrdersTab from '../components/OrdersTab';

const { Title, Text } = Typography;
const { TabPane } = Tabs;

export default function Dashboard() {
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [accessToken, setAccessToken] = useState(null);
    const [userEmail, setUserEmail] = useState(null);
    const [isScanning, setIsScanning] = useState(false);
    const [scanProgress, setScanProgress] = useState({
        total: 0,
        current: 0,
        processed: 0,
        skipped: 0,
        failed: 0
    });
    const [orders, setOrders] = useState([]);
    const [lastScanDate, setLastScanDate] = useState(null);
    const [scanModalVisible, setScanModalVisible] = useState(false);
    const [activeTab, setActiveTab] = useState('orders');

    // Google Login Implementation
    const login = useGoogleLogin({
        scope: GMAIL_SCOPES.join(' '),
        onSuccess: async (response) => {
            try {
                console.log(APP_URL);
                const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
                    headers: { Authorization: `Bearer ${response.access_token}` }
                });
                const userInfo = await userInfoResponse.json();

                // Sign in with Supabase
                const { data: authData, error: authError } = await supabase.auth.signInWithOAuth({
                    provider: 'google',
                    options: {
                        redirectTo: APP_URL
                    }
                });

                if (authError) throw authError;

                setAccessToken(response.access_token);
                setUserEmail(userInfo.email);
                setIsAuthenticated(true);
                message.success('Successfully logged in');

                loadOrders(userInfo.email);
            } catch (error) {
                console.error('Error during login:', error);
                message.error('Failed to log in');
            }
        },
        onError: (error) => {
            console.error('Login Failed:', error);
            message.error('Failed to log in');
        }
    });

    useEffect(() => {
        const storedSession = localStorage.getItem('etsy_scanner_session');
        if (storedSession) {
            const session = JSON.parse(storedSession);
            setAccessToken(session.accessToken);
            setUserEmail(session.userEmail);
            setIsAuthenticated(true);
            loadOrders(session.userEmail);
        }
    }, []);

    useEffect(() => {
        if (isAuthenticated && accessToken && userEmail) {
            localStorage.setItem('etsy_scanner_session', JSON.stringify({
                accessToken,
                userEmail
            }));
        } else {
            localStorage.removeItem('etsy_scanner_session');
        }
    }, [isAuthenticated, accessToken, userEmail]);

    const handleLogout = async () => {
        try {
            await supabase.auth.signOut();
            setAccessToken(null);
            setUserEmail(null);
            setIsAuthenticated(false);
            setOrders([]);
            setLastScanDate(null);
            localStorage.removeItem('etsy_scanner_session');
            message.info('Logged out successfully');
        } catch (error) {
            console.error('Logout error:', error);
            message.error('Failed to log out');
        }
    };

    const loadOrders = async (email) => {
        if (!email) return;

        try {
            const { data, error } = await supabase
                .from('orders')
                .select('*')
                .eq('owner_email', email)
                .order('order_date', { ascending: false });

            if (error) throw error;
            setOrders(data || []);

            const storedLastScanDate = localStorage.getItem(`lastScanDate_${email}`);
            if (storedLastScanDate) {
                setLastScanDate(storedLastScanDate);
            }
        } catch (error) {
            notification.error({
                message: 'Failed to load orders',
                description: error.message
            });
        }
    };

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
}
    const handleScan = async () => {
    if (!accessToken || !userEmail) {
        message.error('Please log in first');
        return;
    }

    setIsScanning(true);
    setScanModalVisible(true);
    setScanProgress({
        total: 0,
        current: 0,
        processed: 0,
        skipped: 0,
        failed: 0
    });

    try {
        const gmailService = new GmailService(accessToken, userEmail, supabase);

        notification.info({
        message: 'Starting Email Scan',
        description: 'Searching for Etsy order emails...',
        duration: 3
        });

        const emails = await gmailService.searchEmails();
        setScanProgress(prev => ({ ...prev, total: emails.length }));
        console.log(`Total emails to scan: ${emails.length}`);

        const BATCH_SIZE = 20;

        for (let i = 0; i < emails.length; i += BATCH_SIZE) {
        const batch = emails.slice(i, i + BATCH_SIZE);
        console.log(`Processing batch ${i / BATCH_SIZE + 1} (emails ${i + 1} to ${i + batch.length})`);

        await Promise.all(batch.map(async (email, index) => {
            try {
            const emailDetails = await gmailService.getEmailDetails(email.id);
            const orderData = gmailService.parseOrderEmail(emailDetails);

            if (orderData) {
                const { data: existingOrder } = await supabase
                .from('orders')
                .select('order_id')
                .eq('order_id', orderData.order_id)
                .eq('owner_email', userEmail)
                .maybeSingle();

                if (existingOrder) {
                setScanProgress(prev => ({ ...prev, skipped: prev.skipped + 1 }));
                console.log(`  [Skipped] Email ${i + index + 1} - Order ID ${orderData.order_id} already exists`);
                return;
                }

                const { error: saveError } = await supabase
                .from('orders')
                .insert([{
                    ...orderData,
                    owner_email: userEmail
                }]);

                if (saveError) {
                setScanProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
                } else {
                setScanProgress(prev => ({ ...prev, processed: prev.processed + 1 }));
                }
            } else {
            }
            } catch (error) {
            console.error(`  [Error] Email ${i + index + 1}:`, error);
            setScanProgress(prev => ({ ...prev, failed: prev.failed + 1 }));
            } finally {
            setScanProgress(prev => ({ ...prev, current: prev.current + 1 }));
            console.log(`  [Done] Email ${i + index + 1}`);
            }
        }));

        // await delay(1000);
      }
        

        const newScanDate = new Date().toISOString();
        setLastScanDate(newScanDate);
        localStorage.setItem(`lastScanDate_${userEmail}`, newScanDate);

        await loadOrders(userEmail);

        notification.success({
        message: 'Scan Completed',
        description: `Processed ${scanProgress.processed} new orders, skipped ${scanProgress.skipped}, failed ${scanProgress.failed}`,
        duration: 5
        });
    } catch (error) {
        notification.error({
        message: 'Scan Failed',
        description: error.message,
        duration: 0
        });
    } finally {
        setIsScanning(false);
    }
    };

    const renderOrdersTab = () => (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Title level={2}>Order Dashboard</Title>
                <Space>
                    {orders.length > 0 && (
                        <ExportButton
                            userEmail={userEmail}
                            disabled={!isAuthenticated || isScanning}
                            accessToken={accessToken}
                            onExportComplete={() => setActiveTab('exports')}
                        />
                    )}
                    {!isAuthenticated ? (
                        <Button
                            type="primary"
                            icon={<LoginOutlined />}
                            onClick={() => login()}
                        >
                            Login with Google
                        </Button>
                    ) : (
                        <>
                            <Button
                                type="primary"
                                icon={<SyncOutlined spin={isScanning} />}
                                onClick={handleScan}
                                disabled={isScanning}
                            >
                                {isScanning ? 'Scanning...' : 'Scan Orders'}
                            </Button>
                            <Button
                                icon={<LogoutOutlined />}
                                onClick={handleLogout}
                            >
                                Logout
                            </Button>
                        </>
                    )}
                </Space>
            </div>

            {lastScanDate && (
                <Card size="small">
                    <Space>
                        <InfoCircleOutlined />
                        <Text>Last scan: {new Date(lastScanDate).toLocaleString()}</Text>
                    </Space>
                </Card>
            )}

            <OrdersTab orders={orders} loading={isScanning} />
        </Space>
    );

    return (
        <>
            <Tabs activeKey={activeTab} onChange={setActiveTab} type="card">
                <TabPane tab="Orders" key="orders">
                    {renderOrdersTab()}
                </TabPane>
                <TabPane tab="Export History" key="exports">
                    <ExportsTab userEmail={userEmail} />
                </TabPane>
            </Tabs>

            <Modal
                title="Scanning Progress"
                open={scanModalVisible}
                footer={null}
                closable={!isScanning}
                onCancel={() => !isScanning && setScanModalVisible(false)}
                width={600}
            >
                <Space direction="vertical" style={{ width: '100%' }} size="large">
                    <Progress
                        percent={Math.round((scanProgress.current / scanProgress.total) * 100)}
                        status={isScanning ? 'active' : 'success'}
                        style={{ marginBottom: 20 }}
                    />

                    <Space wrap>
                        <Statistic
                            title="Total Emails"
                            value={scanProgress.total}
                            prefix={<InfoCircleOutlined />}
                        />
                        <Statistic
                            title="Processed"
                            value={scanProgress.processed}
                            prefix={<CheckCircleOutlined style={{ color: '#52c41a' }} />}
                        />
                        <Statistic
                            title="Skipped"
                            value={scanProgress.skipped}
                            prefix={<WarningOutlined style={{ color: '#faad14' }} />}
                        />
                        <Statistic
                            title="Failed"
                            value={scanProgress.failed}
                            prefix={<WarningOutlined style={{ color: '#ff4d4f' }} />}
                        />
                    </Space>

                    {isScanning && (
                        <Text type="secondary">
                            Processing email {scanProgress.current} of {scanProgress.total}
                        </Text>
                    )}
                </Space>
            </Modal>
        </>
    );
}
