// api/submit.js - Vercel无服务器函数
const COS = require('cos-nodejs-sdk-v5');

// 允许跨域的域名
const allowedOrigins = [
    'https://your-username.github.io', // 替换为你的GitHub Pages地址
    'http://localhost:8080',
    'http://127.0.0.1:8080'
];

export default async function handler(req, res) {
    // 设置CORS
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');

    // 处理预检请求
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // 只允许POST请求
    if (req.method !== 'POST') {
        return res.status(405).json({ error: '只允许POST请求' });
    }

    try {
        // 从环境变量获取腾讯云凭证
        const cos = new COS({
            SecretId: process.env.TENCENT_SECRET_ID,
            SecretKey: process.env.TENCENT_SECRET_KEY
        });

        const bucketConfig = {
            Bucket: 'umssurvey-data-1377726259',
            Region: 'ap-guangzhou'
        };

        // 验证必要的数据
        const { sessionData, comparisonRecords } = req.body;
        if (!sessionData || !comparisonRecords) {
            return res.status(400).json({ error: '缺少必要的数据' });
        }

        console.log(`收到问卷数据: ${sessionData.userData.nickname}, 对比数量: ${comparisonRecords.length}`);

        // 读取现有数据
        let existingData;
        try {
            const data = await cos.getObject({
                ...bucketConfig,
                Key: 'survey-data.json'
            }).promise();
            existingData = JSON.parse(data.Body.toString());
        } catch (err) {
            if (err.statusCode === 404) {
                existingData = { sessions: [], comparisonRecords: [] };
                console.log('创建新的数据文件');
            } else {
                throw err;
            }
        }

        // 更新数据
        const filteredSessions = existingData.sessions.filter(
            s => s.userData.nickname !== sessionData.userData.nickname
        );
        const updatedSessions = [...filteredSessions, sessionData];
        const updatedComparisons = [...existingData.comparisonRecords, ...comparisonRecords];

        const fullData = {
            sessions: updatedSessions,
            comparisonRecords: updatedComparisons,
            lastUpdated: new Date().toISOString(),
            version: '3.0_vercel_secure',
            totalSessions: updatedSessions.length,
            totalComparisons: updatedComparisons.length
        };

        // 保存到腾讯云
        await cos.putObject({
            ...bucketConfig,
            Key: 'survey-data.json',
            Body: JSON.stringify(fullData, null, 2),
            ContentType: 'application/json'
        }).promise();

        console.log(`数据保存成功: 总会话 ${updatedSessions.length}, 总对比 ${updatedComparisons.length}`);

        res.json({
            success: true,
            message: '数据保存成功',
            totalSessions: updatedSessions.length,
            totalComparisons: updatedComparisons.length
        });

    } catch (error) {
        console.error('保存失败:', error);
        res.status(500).json({ error: '服务器错误: ' + error.message });
    }
}