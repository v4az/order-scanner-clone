// src/components/OrdersTab.jsx
import { Table, Typography, Space } from 'antd';

const { Text } = Typography;

const OrdersTab = ({ orders, loading }) => {
    const columns = [
        {
            title: 'Order ID',
            dataIndex: 'order_id',
            key: 'order_id',
            width: 120,
        },
        {
            title: 'Buyer Email',
            dataIndex: 'buyer_email',
            key: 'buyer_email',
            width: 200,
        },
        {
            title: 'Product',
            dataIndex: 'product_name',
            key: 'product_name',
            width: 300,
            render: (text) => {
                // Split product names by commas and render them in lines
                const products = text.split(',');
                return (
                    <div style={{ whiteSpace: 'pre-line' }}>
                        {products.map((product, index) => (
                            <div key={index}>{product.trim()}</div>
                        ))}
                    </div>
                );
            }
        },
        {
            title: 'Options',
            dataIndex: 'product_options',
            key: 'product_options',
            width: 200,
            render: (options) => {
                if (!options) return '-';
                return (
                    <Space direction="vertical" size="small">
                        {Object.entries(options).map(([key, value]) => (
                            <div key={key}>
                                <Text type="secondary">{key}:</Text> {value}
                            </div>
                        ))}
                    </Space>
                );
            },
        },
        {
            title: 'Shop Name',
            dataIndex: 'shop_name',
            key: 'shop_name',
            width: 150,
        },
        {
            title: 'Order Date',
            dataIndex: 'order_date',
            key: 'order_date',
            width: 120,
            render: (date) => new Date(date).toLocaleDateString(),
            sorter: (a, b) => new Date(b.order_date) - new Date(a.order_date),
        }
    ];

    return (
        <Table
            dataSource={orders}
            columns={columns}
            rowKey="order_id"
            loading={loading}
            pagination={{
                defaultPageSize: 10,
                showSizeChanger: true,
                showTotal: (total) => `Total ${total} orders`
            }}
            locale={{
                emptyText: 'No orders found. Click "Scan Orders" to start scanning your inbox.'
            }}
            scroll={{ x: 'max-content' }}
        />
    );
};

export default OrdersTab;