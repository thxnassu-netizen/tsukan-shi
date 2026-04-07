require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const Groq = require('groq-sdk');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

let groq;
function getGroq() {
  if (!groq) groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  return groq;
}

const KANTA_SYSTEM = `あなたは「葵先生」という通関士試験の専門家です。
凛とした知的なクールな女性教師で、通関・貿易・関税法・通関業法・外為法の専門家です。
常に丁寧なですます調で話します。感情的な励ましより、正確で簡潔な解説を重視するスタイルです。
回答は200文字以内を目安に的確にまとめてください。
「正確に理解することが合格への近道です」「条文に戻って確認しましょう」「その点は重要です」のような、知的でクールなトーンで話してください。
必要以上に感嘆符や絵文字を使わず、落ち着いたプロフェッショナルな口調を保ってください。`;

// POST /api/chat - キャラがユーザー質問に答える
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) return res.status(400).json({ error: 'message is required' });

    const completion = await getGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: KANTA_SYSTEM },
        { role: 'user', content: message }
      ],
      max_tokens: 400,
      temperature: 0.7,
    });

    const reply = completion.choices[0]?.message?.content || '申し訳ありません、うまく答えられませんでした。';
    res.json({ reply });
  } catch (err) {
    console.error('/api/chat error:', err);
    res.status(500).json({ error: 'API error', detail: err.message });
  }
});

// POST /api/explain - 問題の正誤を受け取り解説
app.post('/api/explain', async (req, res) => {
  try {
    const { question, choices, correctIndex, selectedIndex, explanation } = req.body;
    const isCorrect = selectedIndex === correctIndex;
    const selectedText = choices[selectedIndex];
    const correctText = choices[correctIndex];

    const prompt = isCorrect
      ? `以下の通関士試験問題に正解しました！簡潔に解説してください。\n問題: ${question}\n正解: ${correctText}\n${explanation ? '解説ヒント: ' + explanation : ''}`
      : `以下の通関士試験問題を間違えました。やさしく解説してください。\n問題: ${question}\n選んだ答え: ${selectedText}\n正解: ${correctText}\n${explanation ? '解説ヒント: ' + explanation : ''}`;

    const completion = await getGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: KANTA_SYSTEM },
        { role: 'user', content: prompt }
      ],
      max_tokens: 500,
      temperature: 0.6,
    });

    const reply = completion.choices[0]?.message?.content || '解説できませんでした。';
    res.json({ reply, isCorrect });
  } catch (err) {
    console.error('/api/explain error:', err);
    res.status(500).json({ error: 'API error', detail: err.message });
  }
});

// GET /api/daily - 今日の一問をGroqが生成
app.get('/api/daily', async (req, res) => {
  try {
    const prompt = `通関士試験（関税法・通関業法・外為法のいずれか）の4択問題を1問作成してください。
以下のJSON形式で返してください（他のテキストは不要）:
{
  "subject": "関税法",
  "question": "問題文",
  "choices": ["選択肢A", "選択肢B", "選択肢C", "選択肢D"],
  "correctIndex": 0,
  "explanation": "解説文（2〜3文）"
}
実際の通関士試験に出題されるレベルの問題にしてください。`;

    const completion = await getGroq().chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      messages: [
        { role: 'system', content: 'あなたは通関士試験の出題専門家です。指定されたJSON形式のみで返答してください。' },
        { role: 'user', content: prompt }
      ],
      max_tokens: 600,
      temperature: 0.8,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content || '{}';
    const question = JSON.parse(content);
    res.json(question);
  } catch (err) {
    console.error('/api/daily error:', err);
    // フォールバック問題
    res.json({
      subject: '関税法',
      question: '輸入申告は、原則として貨物が置かれている場所を管轄する税関長に対して行うが、この原則の例外として認められないものはどれか？',
      choices: [
        '輸出入申告官署の自由化（どの税関でも申告可能）',
        '保税地域に搬入前の申告',
        '本邦に到着していない貨物の申告',
        '農水産物の産地での申告'
      ],
      correctIndex: 3,
      explanation: '農水産物の産地での申告は関税法上の特例として認められていません。輸入申告の原則は貨物の置かれている場所を管轄する税関長への申告です。'
    });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`葵先生アプリ起動中 → http://localhost:${PORT}`);
});

module.exports = app;
