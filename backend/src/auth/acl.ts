type Acl = Record<string, Record<string, boolean> | '*'>;

export const ACL: Acl = {
  demo: {
    'GET /api/health': true,
    'GET /api/filters': true,
    'GET /api/filters/:id': true,
    'POST /api/filters': true,
    'PUT /api/filters/:id': true,
    'DELETE /api/filters/:id': true,
    'GET /api/datasets': true,
    'POST /api/filter-simulator/run': true,
    'GET /api/pipeline/jobs/:id': true,
    'POST /api/pipeline/generate-filters': true,
    'GET /api/auth/me': true,
  },
  user: '*',
  admin: '*',
};
