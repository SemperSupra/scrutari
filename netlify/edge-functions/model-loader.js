// Netlify Edge Function: ML Model Loader
// Serves the trained ONNX model and feature keys for browser inference.
//
// Endpoints:
//   GET /api/model/metadata  → model version, feature count, accuracy metrics
//   GET /api/model/features   → feature keys list
//
// The actual model binary is served from Netlify Blob or as a static file.

import modelData from '../../models/random_forest.onnx' assert { type: 'binary' };

const METADATA = {
  version: 1,
  trained: '2026-07-13',
  framework: 'scikit-learn',
  algorithm: 'RandomForestClassifier',
  n_estimators: 100,
  max_depth: 10,
  features: [],  // loaded from feature_keys.json
  metrics: {},   // loaded from training_report.json
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

  if (path === '/api/model/features') {
    return new Response(JSON.stringify({ features: METADATA.features }), { status: 200, headers });
  }

  return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });
};
