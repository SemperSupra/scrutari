// Netlify Edge Function: ML Model Metadata
// Serves model version, feature count, and metrics for browser inference.

const METADATA = {
  version: 1,
  trained: '2026-07-13',
  framework: 'scikit-learn',
  algorithm: 'RandomForestClassifier',
  n_estimators: 100,
  max_depth: 10,
  features: ['device_type', 'browser', 'engine', 'gpu_class', 'font_count', 'has_wasm', 'has_webgl', 'bot_score'],
  metrics: { accuracy: 1.0, precision: 1.0, recall: 1.0, f1: 1.0, samples: 5 },
  status: 'preliminary — trained on 5 samples, retrain with 100+',
};

export default async (req, context) => {
  const url = new URL(req.url);
  const path = url.pathname;

  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=3600',
  };

  if (path === '/api/model/metadata') {
    return new Response(JSON.stringify(METADATA, null, 2), { status: 200, headers });
  }

  return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers });
};
