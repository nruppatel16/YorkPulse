"""SQLAlchemy models for YorkPulse."""

from app.models.base import UUIDMixin, TimestampMixin
from app.models.user import User
from app.models.vault import VaultPost, VaultComment, VaultCategory, VaultPostStatus
from app.models.marketplace import (
    MarketplaceListing,
    MarketplaceCategory,
    ListingStatus,
    ListingCondition,
)
from app.models.buddy import (
    BuddyRequest,
    BuddyParticipant,
    BuddyCategory,
    BuddyRequestStatus,
    ParticipantStatus,
    VibeLevel,
)
from app.models.messaging import (
    Conversation,
    Message,
    ConversationStatus,
)
from app.models.review import Review, ReviewType
from app.models.transaction import MarketplaceTransaction
from app.models.marketplace_review import MarketplaceReview
from app.models.report import UserReport, ReportReason, ReportStatus
from app.models.feedback import UserFeedback, FeedbackType, FeedbackStatus
from app.models.course import (
    Course,
    CourseChannel,
    CourseMember,
    ChannelMember,
    CourseMessage,
    ChannelCreationVote,
    ChannelType,
)
from app.models.gig import (
    Gig,
    GigResponse,
    GigTransaction,
    GigRating,
    GigType,
    GigCategory,
    GigPriceType,
    GigLocation,
    GigStatus,
    GigResponseStatus,
    GigTransactionStatus,
)
from app.models.push_subscription import PushSubscription
from app.models.ignite import IgniteMember, IgniteProject, IgniteTask

__all__ = [
    # Base
    "UUIDMixin",
    "TimestampMixin",
    # User
    "User",
    # Vault
    "VaultPost",
    "VaultComment",
    "VaultCategory",
    "VaultPostStatus",
    # Marketplace
    "MarketplaceListing",
    "MarketplaceCategory",
    "ListingStatus",
    "ListingCondition",
    # Buddy
    "BuddyRequest",
    "BuddyParticipant",
    "BuddyCategory",
    "BuddyRequestStatus",
    "ParticipantStatus",
    "VibeLevel",
    # Messaging
    "Conversation",
    "Message",
    "ConversationStatus",
    # Review
    "Review",
    "ReviewType",
    # Transaction
    "MarketplaceTransaction",
    # Marketplace Review
    "MarketplaceReview",
    # Report
    "UserReport",
    "ReportReason",
    "ReportStatus",
    # Feedback
    "UserFeedback",
    "FeedbackType",
    "FeedbackStatus",
    # Course
    "Course",
    "CourseChannel",
    "CourseMember",
    "ChannelMember",
    "CourseMessage",
    "ChannelCreationVote",
    "ChannelType",
    # Gig
    "Gig",
    "GigResponse",
    "GigTransaction",
    "GigRating",
    "GigType",
    "GigCategory",
    "GigPriceType",
    "GigLocation",
    "GigStatus",
    "GigResponseStatus",
    "GigTransactionStatus",
    # Push
    "PushSubscription",
    "IgniteMember",
    "IgniteProject",
    "IgniteTask",
]
