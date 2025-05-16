const express = require('express');
const cors = require('cors');
const app = express();
// app.use(cors({ origin: 'http://localhost:3000' }));
app.use(cors());
const stockRoutes = require('./src/routes/stockRoute'); // 경로 맞게 조정!
const newsRoutes = require('./src/routes/newsRoute');


app.use(express.json()); // JSON body 파싱
app.use('/api', stockRoutes); // → /api/stocks 로 접근 가능
app.use('/api/news', newsRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`✅ Server running on ${PORT}`);
});
