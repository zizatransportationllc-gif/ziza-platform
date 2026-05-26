"""Notifications package — Sprint 26.

External notification delivery via FCM (push), SendGrid (email),
and AfricasTalking (SMS).

Usage::

    from app.notifications.dispatcher import dispatch_external, register_channel
    from app.notifications.mock import MockChannel  # dev / CI
"""
