"""Validate instance-owned connection options without changing process globals."""
from urllib.parse import urlsplit


def validate_connection(options):
    """Reject malformed credentials/URLs without echoing sensitive values."""
    from .main import WorkError
    for key in ('api_key', 'base_url'):
        if key in options and (not isinstance(options[key], str) or not options[key].strip()):
            raise WorkError('INVALID_SDK_OPTIONS')
    if 'base_url' in options:
        try:
            url = urlsplit(options['base_url'])
            valid = url.scheme in ('http', 'https') and url.hostname and not url.username and not url.password and not url.query and not url.fragment
            _ = url.port
        except ValueError:
            valid = False
        if not valid or 'api_key' not in options:
            raise WorkError('INVALID_SDK_OPTIONS')
    if ('api_key' in options or 'base_url' in options) and (
            not isinstance(options.get('model'), str) or not options['model'].strip()):
        raise WorkError('INVALID_SDK_OPTIONS')
