// src/components/ExportsTab.jsx
import { useState, useEffect } from 'react';
import { Table, Tag, Button, Typography, Tooltip, message, Progress, Space } from 'antd';
import { DownloadOutlined, LoadingOutlined, ReloadOutlined, WarningOutlined } from '@ant-design/icons';
import { supabase } from '../config/supabase';

const { Text } = Typography;

const ExportsTab = ({ userEmail }) => {
    const [loading, setLoading] = useState(false);
    const [exports, setExports] = useState([]);
    const [refreshKey, setRefreshKey] = useState(0);

    useEffect(() => {
        const checkSession = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            if (!session) {
                message.warning('Please log in to access exports');
            }
        };
        if (userEmail) {
            checkSession();
            loadExports();
            // Set up real-time subscription for updates
            const subscription = supabase
                .channel('export-updates')
                .on('postgres_changes', {
                    event: '*',
                    schema: 'public',
                    table: 'export_jobs',
                    filter: `owner_email=eq.${userEmail}`
                }, handleExportUpdate)
                .subscribe();

            return () => {
                subscription.unsubscribe();
            };
        }
    }, [userEmail, refreshKey]);

    const handleExportUpdate = (payload) => {
        loadExports();
    };

    const loadExports = async () => {
        try {
            setLoading(true);
            const { data, error } = await supabase
                .from('export_jobs')
                .select('*')
                .eq('owner_email', userEmail)
                .order('created_at', { ascending: false });

            if (error) throw error;
            setExports(data || []);
        } catch (error) {
            console.error('Error loading exports:', error);
            message.error('Failed to load exports');
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = () => {
        setRefreshKey(prev => prev + 1);
    };

    const handleDownload = async (record) => {
        try {
            if (!record.file_name) {
                throw new Error('File name not found');
            }

            // First verify we have an active session
            const { data: { session }, error: sessionError } = await supabase.auth.getSession();

            if (sessionError || !session) {
                // Try to refresh the session
                const { data: { session: refreshedSession }, error: refreshError } =
                    await supabase.auth.refreshSession();

                if (refreshError || !refreshedSession) {
                    message.error('Please log in again');
                    return;
                }
            }

            // Get signed URL
            const { data, error } = await supabase
                .storage
                .from('exports')
                .createSignedUrl(record.file_name, 3600);

            if (error) throw error;
            if (!data.signedUrl) throw new Error('Failed to generate download link');

            window.open(data.signedUrl, '_blank');
        } catch (error) {
            console.error('Download error:', error);
            message.error(`Failed to download file: ${error.message}`);
        }
    };

    const getStatusTag = (status) => {
        const statusConfig = {
            pending: { color: 'default', text: 'Pending' },
            processing: { color: 'processing', text: 'Processing' },
            completed: { color: 'success', text: 'Completed' },
            failed: { color: 'error', text: 'Failed' }
        };

        const config = statusConfig[status] || statusConfig.pending;
        return <Tag color={config.color}>{config.text}</Tag>;
    };

    const columns = [
        {
            title: 'Export Date',
            dataIndex: 'created_at',
            key: 'created_at',
            render: (date) => new Date(date).toLocaleString(),
            width: 200,
        },
        {
            title: 'Status',
            dataIndex: 'status',
            key: 'status',
            render: (status, record) => (
                <Space direction="vertical" size="small">
                    {getStatusTag(status)}
                    {status === 'processing' && record.progress && (
                        <Progress
                            percent={Math.round((record.progress.current / record.progress.total) * 100)}
                            size="small"
                            status="active"
                        />
                    )}
                </Space>
            ),
            width: 150,
        },
        {
            title: 'Orders',
            dataIndex: 'total_orders',
            key: 'total_orders',
            render: (total) => total || '-',
            width: 100,
        },
        {
            title: 'Date Range',
            dataIndex: 'date_range',
            key: 'date_range',
            render: (range) => {
                if (!range) return '-';
                return `${new Date(range.start).toLocaleDateString()} - ${new Date(range.end).toLocaleDateString()}`;
            },
            width: 200,
        },
        {
            title: 'Action',
            key: 'action',
            render: (_, record) => {
                if (record.status === 'completed') {
                    return (
                        <Tooltip title="Download CSV">
                            <Button
                                icon={<DownloadOutlined />}
                                onClick={() => handleDownload(record)}
                                type="link"
                            >
                                Download
                            </Button>
                        </Tooltip>
                    );
                }
                if (record.status === 'failed') {
                    return (
                        <Tooltip title={record.error_message}>
                            <Text type="danger">
                                <WarningOutlined /> Failed
                            </Text>
                        </Tooltip>
                    );
                }
                if (record.status === 'processing') {
                    return <LoadingOutlined />;
                }
                return null;
            },
            width: 150,
        },
    ];

    return (
        <div>
            <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                    icon={<ReloadOutlined />}
                    onClick={handleRefresh}
                    loading={loading}
                >
                    Refresh
                </Button>
            </div>
            <Table
                columns={columns}
                dataSource={exports}
                rowKey="id"
                loading={loading}
                pagination={{
                    defaultPageSize: 10,
                    showSizeChanger: true,
                    showTotal: (total) => `Total ${total} exports`
                }}
                locale={{
                    emptyText: 'No exports found'
                }}
            />
        </div>
    );
};

export default ExportsTab;