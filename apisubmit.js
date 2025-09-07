// api/submit.js - 修复CORS问题的版本
const COS = require('cos-nodejs-sdk-v5');

export default async function handler(req, res) {
    // 设置CORS - 允许你的前端域名
    const allowedOrigins = [
        'https://gs-yang007.github.io',
        'http://localhost:8080',
        'http://127.0.0.1:8080',
        'http://localhost:3000'
    ];

    const origin = req.headers.origin;
    console.log('请求来源:', origin);

    // 如果请求来源在允许列表中，设置CORS头
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        console.log('允许CORS访问:', origin);
    } else {
        // 如果不在允许列表中，也允许（临时调试用）
        res.setHeader('Access-Control-Allow-Origin', '*');
        console.log('使用通配符允许CORS访问');
    }
    
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // 处理预检请求
    if (req.method === 'OPTIONS') {
        console.log('处理OPTIONS预检请求');
        res.status(200).end();
        return;
    }

    // 只允许POST请求提交数据
    if (req.method !== 'POST') {
        console.log('非POST请求被拒绝:', req.method);
        return res.status(405).json({ error: '只允许POST请求' });
    }

    try {
        console.log('开始处理POST请求...');
        
        // 检查环境变量
        if (!process.env.TENCENT_SECRET_ID || !process.env.TENCENT_SECRET_KEY) {
            console.error('缺少腾讯云环境变量');
            return res.status(500).json({ error: '服务器配置错误：缺少必要的环境变量' });
        }

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
            console.error('缺少必要的数据字段');
            return res.status(400).json({ error: '缺少必要的数据字段' });
        }

        console.log(`收到问卷数据: ${sessionData.userData.nickname}, 对比数量: ${comparisonRecords.length}`);

        // 读取现有数据
        let existingData;
        try {
            console.log('正在读取现有数据...');
            const data = await cos.getObject({
                ...bucketConfig,
                Key: 'survey-data.json'
            }).promise();
            existingData = JSON.parse(data.Body.toString());
            console.log('成功读取现有数据');
        } catch (err) {
            if (err.statusCode === 404) {
                console.log('数据文件不存在，创建新文件');
                existingData = { sessions: [], comparisonRecords: [] };
            } else {
                console.error('读取数据失败:', err);
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
            version: '3.0_vercel_cors_fixed',
            totalSessions: updatedSessions.length,
            totalComparisons: updatedComparisons.length
        };

        // 保存到腾讯云
        console.log('正在保存数据到腾讯云...');
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
        console.error('处理请求失败:', error);
        res.status(500).json({ 
            error: '服务器错误: ' + error.message,
            details: error.toString()
        });
    }
}
