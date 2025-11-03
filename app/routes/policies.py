# File: app/routes/policies.py
"""
Legal pages routes with i18n support.

Provides:
- GET /privacy : Privacy Policy page (multilingual)
- GET /terms   : Terms of Service page (multilingual)
"""

import json
from datetime import datetime
from pathlib import Path

from flask import Blueprint, abort, current_app, render_template, request

bp = Blueprint('policies', __name__)

# Supported languages (matches i18n system)
SUPPORTED_LANGS = [
    'en', 'ko', 'zh-CN', 'zh-TW', 'ja', 'fr', 'de', 'es',
    'it', 'pl', 'pt', 'tr', 'ar', 'th', 'id'
]

# Date format by language
DATE_FORMATS = {
    'en': '%B %d, %Y',
    'ko': '%Y년 %m월 %d일',
    'zh-CN': '%Y年%m月%d日',
    'zh-TW': '%Y年%m月%d日',
    'ja': '%Y年%m月%d日',
    'fr': '%d %B %Y',
    'de': '%d. %B %Y',
    'es': '%d de %B de %Y',
    'it': '%d %B %Y',
    'pl': '%d %B %Y',
    'pt': '%d de %B de %Y',
    'tr': '%d %B %Y',
    'ar': '%d %B %Y',
    'th': '%d %B %Y',
    'id': '%d %B %Y',
}


def load_legal_content(lang, page_type):
    """Load legal page content from JSON file.

    Args:
        lang: Language code (e.g., 'en', 'ko')
        page_type: 'privacy' or 'terms'

    Returns:
        dict: Legal page content, or None if not found
    """
    # Validate language
    if lang not in SUPPORTED_LANGS:
        lang = 'en'  # Fallback to English

    # Build path to JSON file
    static_dir = Path(current_app.static_folder)
    json_path = static_dir / 'i18n' / f'legal_{lang}.json'

    # If language file doesn't exist, fall back to English
    if not json_path.exists():
        json_path = static_dir / 'i18n' / 'legal_en.json'
        lang = 'en'

    try:
        with open(json_path, encoding='utf-8') as f:
            data = json.load(f)
            return data.get(page_type), data.get('footer'), lang
    except (FileNotFoundError, json.JSONDecodeError):
        return None, None, lang


@bp.get('/privacy')
def privacy():
    """Render the Privacy Policy page with i18n support."""
    lang = request.args.get('lang', 'en')

    content, footer, actual_lang = load_legal_content(lang, 'privacy')

    if not content:
        abort(500, 'Legal content not available')

    # Check if this is a machine translation
    is_machine_translated = actual_lang not in ['en', 'ko']

    # Format date according to language
    date_format = DATE_FORMATS.get(actual_lang, '%B %d, %Y')
    last_updated = datetime.now().strftime(date_format)

    return render_template(
        'legal.html',
        lang=actual_lang,
        page_title=content['title'],
        data=content,
        footer=footer,
        last_updated=last_updated,
        is_machine_translated=is_machine_translated
    )


@bp.get('/terms')
def terms():
    """Render the Terms of Service page with i18n support."""
    lang = request.args.get('lang', 'en')

    content, footer, actual_lang = load_legal_content(lang, 'terms')

    if not content:
        abort(500, 'Legal content not available')

    # Check if this is a machine translation
    is_machine_translated = actual_lang not in ['en', 'ko']

    # Format date according to language
    date_format = DATE_FORMATS.get(actual_lang, '%B %d, %Y')
    last_updated = datetime.now().strftime(date_format)

    return render_template(
        'legal.html',
        lang=actual_lang,
        page_title=content['title'],
        data=content,
        footer=footer,
        last_updated=last_updated,
        is_machine_translated=is_machine_translated
    )
