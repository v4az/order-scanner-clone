// src/components/ExportButton.jsx
import { useState } from 'react';
import { Button, message, Tooltip } from 'antd';
import { DownloadOutlined, LoadingOutlined } from '@ant-design/icons';
import { supabase } from '../config/supabase';

const ExportButton = ({ userEmail, disabled, accessToken, onExportComplete }) => {
    const [isExporting, setIsExporting] = useState(false);

    const handleExport = async () => {
        try {
            setIsExporting(true);
            console.log('Starting export for:', userEmail);

            // Create export job
            const { data: jobData, error: jobError } = await supabase
                .from('export_jobs')
                .insert({
                    owner_email: userEmail,
                    status: 'pending',
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (jobError) {
                console.error('Job creation error:', jobError);
                throw jobError;
            }

            console.log('Job created:', jobData);

            // Call edge function
            const response = await fetch(
                `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/export-orders`,
                {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${accessToken}`,
                        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY
                    },
                    body: JSON.stringify({
                        jobId: jobData.id,
                        userEmail: userEmail
                    })
                }
            );

            console.log('Edge function response status:', response.status);

            if (!response.ok) {
                const errorData = await response.json();
                console.error('Edge function error:', errorData);
                throw new Error(errorData.error || 'Export failed');
            }

            const responseData = await response.json();
            console.log('Edge function response:', responseData);

            message.success('Export started! You can track progress in the Exports tab.');
            if (onExportComplete) {
                onExportComplete();
            }

        } catch (error) {
            console.error('Export error:', error);
            message.error(`Export failed: ${error.message}`);
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <Tooltip title={isExporting ? 'Export in progress...' : 'Export orders to CSV'}>
            <Button
                icon={isExporting ? <LoadingOutlined /> : <DownloadOutlined />}
                onClick={handleExport}
                disabled={disabled || isExporting}
            >
                {isExporting ? 'Exporting...' : 'Export'}
            </Button>
        </Tooltip>
    );
};

export default ExportButton;