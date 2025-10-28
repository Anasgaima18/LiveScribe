import sanitizeHtml from 'sanitize-html';

// Recursively sanitize strings in an object/array
const sanitizeValue = (val) => {
  if (typeof val === 'string') {
    return sanitizeHtml(val, {
      allowedTags: [],
      allowedAttributes: {},
      // keep text only; strip all HTML tags
      disallowedTagsMode: 'discard',
    });
  }
  if (Array.isArray(val)) {
    return val.map(sanitizeValue);
  }
  if (val && typeof val === 'object') {
    return Object.fromEntries(
      Object.entries(val).map(([k, v]) => [k, sanitizeValue(v)])
    );
  }
  return val;
};

export const sanitizeRequest = (req, _res, next) => {
  if (req.body) req.body = sanitizeValue(req.body);
  if (req.query) req.query = sanitizeValue(req.query);
  if (req.params) req.params = sanitizeValue(req.params);
  next();
};

export default sanitizeRequest;
