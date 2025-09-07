// api/submit.js - Vercel�޷���������
const COS = require('cos-nodejs-sdk-v5');

// ������������
const allowedOrigins = [
    'https://your-username.github.io', // �滻Ϊ���GitHub Pages��ַ
    'http://localhost:8080',
    'http://127.0.0.1:8080'
];

export default async function handler(req, res) {
    // ����CORS
    const origin = req.headers.origin;
    if (allowedOrigins.includes(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Admin-Key');

    // ����Ԥ������
    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    // ֻ����POST����
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'ֻ����POST����' });
    }

    try {
        // �ӻ���������ȡ��Ѷ��ƾ֤
        const cos = new COS({
            SecretId: process.env.TENCENT_SECRET_ID,
            SecretKey: process.env.TENCENT_SECRET_KEY
        });

        const bucketConfig = {
            Bucket: 'umssurvey-data-1377726259',
            Region: 'ap-guangzhou'
        };

        // ��֤��Ҫ������
        const { sessionData, comparisonRecords } = req.body;
        if (!sessionData || !comparisonRecords) {
            return res.status(400).json({ error: 'ȱ�ٱ�Ҫ������' });
        }

        console.log(`�յ��ʾ�����: ${sessionData.userData.nickname}, �Ա�����: ${comparisonRecords.length}`);

        // ��ȡ��������
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
                console.log('�����µ������ļ�');
            } else {
                throw err;
            }
        }

        // ��������
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

        // ���浽��Ѷ��
        await cos.putObject({
            ...bucketConfig,
            Key: 'survey-data.json',
            Body: JSON.stringify(fullData, null, 2),
            ContentType: 'application/json'
        }).promise();

        console.log(`���ݱ���ɹ�: �ܻỰ ${updatedSessions.length}, �ܶԱ� ${updatedComparisons.length}`);

        res.json({
            success: true,
            message: '���ݱ���ɹ�',
            totalSessions: updatedSessions.length,
            totalComparisons: updatedComparisons.length
        });

    } catch (error) {
        console.error('����ʧ��:', error);
        res.status(500).json({ error: '����������: ' + error.message });
    }
}