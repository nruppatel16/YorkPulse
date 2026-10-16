import type { IgniteMember, IgniteProject, IgniteTask, MemberInput, ProjectInput, TaskInput } from "@/components/ignite/types";
import type {
  User,
  VaultPost,
  MarketplaceListing,
  SideQuest,
  QuestParticipant,
  QuestCategory,
  VibeLevel,
  QuestStatus,
  QuestMessage,
  Conversation,
  Message,
  Review,
  PaginatedResponse,
  Course,
  CourseChannel,
  CourseMessage,
  CourseHierarchy,
  VoteStatus,
  CourseMembership,
  CourseParticipant,
  Gig,
  GigResponse,
  GigTransaction,
  GigRating,
  GigProfile,
  GigType,
  GigCategory,
  GigPriceType,
  GigLocation,
  GigStatus,
  Residence,
  ResidenceChannel,
  ResidenceMessage,
  ResidenceMembership,
  ResidenceParticipant,
} from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "https://api.yorkpulse.com";
const API_PREFIX = "/api/v1";

interface ApiError {
  detail: string;
}

interface LoginResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
}

interface SignupResponse {
  message: string;
  email: string;
}

interface VerifyEmailResponse {
  access_token: string;
  refresh_token: string;
  token_type: string;
  expires_in: number;
  requires_name_verification: boolean;
}

interface PresignedUrlResponse {
  upload_url: string;
  file_url: string;
}

interface VerifyIdResponse {
  verified: boolean;
  extracted_name: string | null;
  message: string;
}

/** Extract a readable message from a FastAPI error response.
 *  detail can be a string ("Not found") or a validation array
 *  ([{loc,msg,type}, ...]) — both must produce a human-readable string.
 */
function parseErrorDetail(detail: unknown, fallback = "An unexpected error occurred"): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (first && typeof first.msg === "string") return first.msg;
  }
  return fallback;
}

class ApiClient {
  private baseUrl: string;
  private getToken: (() => string | null) | null = null;
  private getRefreshToken: (() => string | null) | null = null;
  private onTokenRefreshed: ((accessToken: string, refreshToken: string) => void) | null = null;
  private onUnauthorized: (() => void) | null = null;
  private isRefreshing = false;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  setTokenGetter(getter: () => string | null) {
    this.getToken = getter;
  }

  setRefreshTokenGetter(getter: () => string | null) {
    this.getRefreshToken = getter;
  }

  setTokenRefreshedHandler(handler: (accessToken: string, refreshToken: string) => void) {
    this.onTokenRefreshed = handler;
  }

  setUnauthorizedHandler(handler: () => void) {
    this.onUnauthorized = handler;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {},
    isRetry = false
  ): Promise<T> {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    const token = this.getToken?.();
    if (token) {
      (headers as Record<string, string>)["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${API_PREFIX}${endpoint}`, {
      ...options,
      headers,
    });

    if (response.status === 401) {
      // Don't try to refresh if this is already a retry or a refresh request itself
      if (!isRetry && !endpoint.includes("/auth/refresh") && !this.isRefreshing) {
        const refreshed = await this._tryRefresh();
        if (refreshed) {
          return this.request<T>(endpoint, options, true);
        }
      }
      this.onUnauthorized?.();
      throw new Error("Unauthorized");
    }

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        detail: "An unexpected error occurred",
      }));
      throw new Error(parseErrorDetail(error.detail));
    }

    if (response.status === 204) {
      return undefined as T;
    }

    return response.json();
  }

  private async _tryRefresh(): Promise<boolean> {
    const refreshToken = this.getRefreshToken?.();
    if (!refreshToken) return false;
    this.isRefreshing = true;
    try {
      const data = await this.post<{ access_token: string; refresh_token: string }>(
        "/auth/refresh",
        { refresh_token: refreshToken }
      );
      this.onTokenRefreshed?.(data.access_token, data.refresh_token);
      return true;
    } catch {
      return false;
    } finally {
      this.isRefreshing = false;
    }
  }

  async get<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "GET" });
  }

  async post<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "POST",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PUT",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async patch<T>(endpoint: string, data?: unknown): Promise<T> {
    return this.request<T>(endpoint, {
      method: "PATCH",
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<T> {
    return this.request<T>(endpoint, { method: "DELETE" });
  }

  async postFormData<T>(endpoint: string, formData: FormData): Promise<T> {
    const headers: HeadersInit = {};
    // Don't set Content-Type for FormData - browser will set it with boundary
    const token = this.getToken?.();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    const response = await fetch(`${this.baseUrl}${API_PREFIX}${endpoint}`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (response.status === 401) {
      if (!this.isRefreshing) {
        const refreshed = await this._tryRefresh();
        if (refreshed) {
          return this.postFormData<T>(endpoint, formData);
        }
      }
      this.onUnauthorized?.();
      throw new Error("Unauthorized");
    }

    if (!response.ok) {
      const error: ApiError = await response.json().catch(() => ({
        detail: "An unexpected error occurred",
      }));
      throw new Error(parseErrorDetail(error.detail));
    }

    return response.json();
  }

  // Auth endpoints
  auth = {
    // `hp` is a honeypot value from a hidden form field — real users never
    // fill it in, so it's always "" for them. Passed through untouched.
    signup: (email: string, hp?: string) =>
      this.post<SignupResponse>("/auth/signup", { email, hp }),

    login: (email: string, hp?: string) =>
      this.post<SignupResponse>("/auth/login", { email, hp }),

    adminLogin: (email: string, password: string) =>
      this.post<VerifyEmailResponse>("/auth/admin-login", { email, password }),

    sandboxLogin: (email: string, password: string) =>
      this.post<VerifyEmailResponse>("/auth/sandbox-login", { email, password }),

    verifyEmail: (token: string) =>
      this.post<VerifyEmailResponse>("/auth/verify-email", { token }),

    verifyOTP: (email: string, code: string) =>
      this.post<VerifyEmailResponse>("/auth/verify-otp", { email, code }),

    resendOTP: (email: string, hp?: string) =>
      this.post<{ success: boolean; message: string }>("/auth/resend-otp", { email, hp }),

    verifyName: (name: string) =>
      this.post<{ name_verified: boolean; requires_id_upload: boolean; message: string }>("/auth/verify-name", { name }),

    getPresignedUrl: (fileType: string) =>
      this.post<PresignedUrlResponse>("/auth/upload-id", { file_type: fileType }),

    verifyId: (imageUrl: string, providedName: string) =>
      this.post<VerifyIdResponse>("/auth/verify-id", {
        image_url: imageUrl,
        provided_name: providedName,
      }),

    me: () => this.get<User>("/auth/me"),

    updateProfile: (data: Partial<User>) =>
      this.patch<User>("/auth/me", data),

    refreshToken: (refreshToken: string) =>
      this.post<LoginResponse>("/auth/refresh", { refresh_token: refreshToken }),

    getAvatarUploadUrl: (filename: string, contentType: string) =>
      this.post<{ upload_url: string; file_url: string; expires_in: number }>(
        "/auth/avatar-upload",
        { filename, content_type: contentType }
      ),

    getPublicProfile: (userId: string) =>
      this.get<{
        id: string;
        name: string;
        name_verified: boolean;
        is_founder: boolean;
        program: string | null;
        bio: string | null;
        avatar_url: string | null;
        interests: string[] | null;
        created_at: string | null;
      }>(`/auth/users/${userId}`),
  };

  // Vault endpoints
  vault = {
    getPosts: (params?: { category?: string; page?: number; per_page?: number }) => {
      const searchParams = new URLSearchParams();
      if (params?.category) searchParams.set("category", params.category);
      if (params?.page) searchParams.set("page", params.page.toString());
      if (params?.per_page) searchParams.set("per_page", params.per_page.toString());
      const query = searchParams.toString();
      return this.get<PaginatedResponse<VaultPost>>(`/vault${query ? `?${query}` : ""}`);
    },

    getPost: (id: string) => this.get<VaultPost>(`/vault/${id}`),

    createPost: (data: { title: string; content: string; category: string; is_anonymous: boolean; images?: string[] | null }) =>
      this.post<VaultPost>("/vault", data),

    uploadImageDirect: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      return api.postFormData<{ public_url: string }>("/vault/upload-image-direct", formData);
    },

    updatePost: (id: string, data: { title?: string; content?: string; category?: string }) =>
      this.patch<VaultPost>(`/vault/${id}`, data),

    deletePost: (id: string) => this.delete<void>(`/vault/${id}`),

    flagPost: (id: string) => this.post<{ message: string }>(`/vault/${id}/flag`),

    getComments: (postId: string, page?: number) => {
      const query = page ? `?page=${page}` : "";
      return this.get<PaginatedResponse<{
        id: string;
        post_id: string;
        content: string;
        is_anonymous: boolean;
        is_hidden: boolean;
        parent_id: string | null;
        author: { id: string; name: string; avatar_url: string | null } | null;
        created_at: string;
      }>>(`/vault/${postId}/comments${query}`);
    },

    createComment: (postId: string, data: { content: string; is_anonymous: boolean }) =>
      this.post<{ id: string; content: string }>(`/vault/${postId}/comments`, data),

    deleteComment: (postId: string, commentId: string) =>
      this.delete<void>(`/vault/${postId}/comments/${commentId}`),
  };

  // Marketplace endpoints
  marketplace = {
    getListings: (params?: {
      category?: string;
      condition?: string;
      min_price?: number;
      max_price?: number;
      search?: string;
      page?: number;
      per_page?: number;
    }) => {
      const searchParams = new URLSearchParams();
      if (params?.category) searchParams.set("category", params.category);
      if (params?.condition) searchParams.set("condition", params.condition);
      if (params?.min_price) searchParams.set("min_price", params.min_price.toString());
      if (params?.max_price) searchParams.set("max_price", params.max_price.toString());
      if (params?.search) searchParams.set("search", params.search);
      if (params?.page) searchParams.set("page", params.page.toString());
      if (params?.per_page) searchParams.set("per_page", params.per_page.toString());
      const query = searchParams.toString();
      return this.get<PaginatedResponse<MarketplaceListing>>(`/marketplace${query ? `?${query}` : ""}`);
    },

    getListing: (id: string) => this.get<MarketplaceListing>(`/marketplace/${id}`),

    createListing: (data: {
      title: string;
      description: string;
      price: number;
      category: string;
      condition: string;
      images?: string[];
    }) => this.post<MarketplaceListing>("/marketplace", data),

    updateListing: (id: string, data: Partial<{
      title: string;
      description: string;
      price: number;
      category: string;
      condition: string;
      status: string;
      images: string[];
    }>) => this.patch<MarketplaceListing>(`/marketplace/${id}`, data),

    deleteListing: (id: string) => this.delete<void>(`/marketplace/${id}`),

    getMyListings: (page?: number) => {
      const query = page ? `?page=${page}` : "";
      return this.get<PaginatedResponse<MarketplaceListing>>(`/marketplace/my-listings${query}`);
    },

    getUploadUrl: (filename: string, contentType: string) =>
      this.post<{
        upload_url: string;
        file_key: string;
        public_url: string;
        expires_in: number;
      }>("/marketplace/upload-image", { filename, content_type: contentType }),

    uploadImageDirect: (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      // Use the API client's request method to get proper auth headers
      return api.postFormData<{ public_url: string; file_key: string }>(
        "/marketplace/upload-image-direct",
        formData
      );
    },
  };

  // Side Quests endpoints
  quests = {
    getQuests: (params?: {
      category?: QuestCategory;
      status?: QuestStatus;
      vibe_level?: VibeLevel;
      date_from?: string;
      date_to?: string;
      sort_by?: "newest" | "starting_soon" | "most_spots";
      page?: number;
      per_page?: number;
    }) => {
      const searchParams = new URLSearchParams();
      if (params?.category) searchParams.set("category", params.category);
      if (params?.status) searchParams.set("status", params.status);
      if (params?.vibe_level) searchParams.set("vibe_level", params.vibe_level);
      if (params?.date_from) searchParams.set("date_from", params.date_from);
      if (params?.date_to) searchParams.set("date_to", params.date_to);
      if (params?.sort_by) searchParams.set("sort_by", params.sort_by);
      if (params?.page) searchParams.set("page", params.page.toString());
      if (params?.per_page) searchParams.set("per_page", params.per_page.toString());
      const query = searchParams.toString();
      return this.get<PaginatedResponse<SideQuest> & { has_more: boolean }>(`/quests${query ? `?${query}` : ""}`);
    },

    getQuest: (id: string) => this.get<SideQuest>(`/quests/${id}`),

    createQuest: (data: {
      category: QuestCategory;
      custom_category?: string;
      activity: string;
      description?: string;
      start_time: string;
      end_time?: string;
      location: string;
      latitude?: number;
      longitude?: number;
      vibe_level?: VibeLevel;
      custom_vibe_level?: string;
      max_participants?: number;
      requires_approval?: boolean;
    }) => this.post<SideQuest>("/quests", data),

    updateQuest: (id: string, data: Partial<{
      activity: string;
      description: string;
      start_time: string;
      end_time: string;
      location: string;
      latitude: number;
      longitude: number;
      vibe_level: VibeLevel;
      max_participants: number;
      requires_approval: boolean;
      status: QuestStatus;
    }>) => this.patch<SideQuest>(`/quests/${id}`, data),

    deleteQuest: (id: string) => this.delete<void>(`/quests/${id}`),

    completeQuest: (id: string) => this.post<SideQuest>(`/quests/${id}/complete`),

    joinQuest: (id: string, message?: string) =>
      this.post<QuestParticipant>(`/quests/${id}/join`, { message }),

    leaveQuest: (id: string) => this.delete<void>(`/quests/${id}/leave`),

    getParticipants: (id: string) =>
      this.get<{ items: QuestParticipant[]; total: number }>(`/quests/${id}/participants`),

    approveParticipant: (questId: string, participantId: string, action: "accept" | "reject") =>
      this.post<QuestParticipant>(`/quests/${questId}/participants/${participantId}`, { action }),

    removeParticipant: (questId: string, userId: string) =>
      this.delete<void>(`/quests/${questId}/participants/${userId}`),

    getMyQuests: (params?: { role?: "host" | "participant" | "pending" | "all"; page?: number; per_page?: number }) => {
      const searchParams = new URLSearchParams();
      if (params?.role) searchParams.set("role", params.role);
      if (params?.page) searchParams.set("page", params.page.toString());
      if (params?.per_page) searchParams.set("per_page", params.per_page.toString());
      const query = searchParams.toString();
      return this.get<PaginatedResponse<SideQuest> & { has_more: boolean }>(`/quests/my-quests${query ? `?${query}` : ""}`);
    },

    // Quest Group Chat
    getQuestMessages: (questId: string, params?: { before?: string; limit?: number }) => {
      const searchParams = new URLSearchParams();
      if (params?.before) searchParams.set("before", params.before);
      if (params?.limit) searchParams.set("limit", params.limit.toString());
      const query = searchParams.toString();
      return this.get<{ messages: QuestMessage[]; has_more: boolean }>(`/quests/${questId}/chat${query ? `?${query}` : ""}`);
    },

    sendQuestMessage: (questId: string, content: string, replyToId?: string) =>
      this.post<QuestMessage>(`/quests/${questId}/chat`, { content, reply_to_id: replyToId || null }),
  };

  // Legacy alias for backwards compatibility
  get buddy() {
    return this.quests;
  }

  // Messaging endpoints
  messaging = {
    getConversations: (page?: number) => {
      const query = page ? `?page=${page}` : "";
      return this.get<{ items: Conversation[]; total: number }>(`/messages/conversations${query}`);
    },

    getConversation: (id: string) => this.get<Conversation>(`/messages/conversations/${id}`),

    startConversation: (data: {
      recipient_id: string;
      initial_message: string;
      context_type?: "marketplace" | "buddy" | "profile";
      context_id?: string;
    }) => this.post<Conversation>("/messages/conversations", data),

    acceptConversation: (id: string) =>
      this.post<Conversation>(`/messages/conversations/${id}/accept`),

    declineConversation: (id: string) =>
      this.post<void>(`/messages/conversations/${id}/decline`),

    blockConversation: (id: string) =>
      this.post<{ message: string }>(`/messages/conversations/${id}/block`),

    unblockConversation: (id: string) =>
      this.post<Conversation>(`/messages/conversations/${id}/unblock`),

    getMessages: (conversationId: string, params?: { before?: string; limit?: number }) => {
      const searchParams = new URLSearchParams();
      if (params?.before) searchParams.set("before", params.before);
      if (params?.limit) searchParams.set("limit", params.limit.toString());
      const query = searchParams.toString();
      return this.get<{ messages: Message[]; has_more: boolean }>(`/messages/conversations/${conversationId}/messages${query ? `?${query}` : ""}`);
    },

    sendMessage: (conversationId: string, content?: string, imageUrl?: string, replyToId?: string) =>
      this.post<Message>(`/messages/conversations/${conversationId}/messages`, {
        content: content || null,
        image_url: imageUrl || null,
        reply_to_id: replyToId || null,
      }),

    getChatImageUploadUrl: (filename: string, contentType: string) =>
      this.post<{ upload_url: string; file_url: string; expires_in: number }>(
        "/messages/upload-image",
        { filename, content_type: contentType }
      ),

    markAsRead: (conversationId: string) =>
      this.post<void>(`/messages/conversations/${conversationId}/read`),

    getPendingRequests: () =>
      this.get<{ requests: Conversation[] }>("/messages/requests"),

    getUnreadCount: () =>
      this.get<{ unread_count: number }>("/messages/unread-count"),
  };

  // Reviews endpoints
  reviews = {
    createReview: (data: {
      reviewed_id: string;
      rating: number;
      comment?: string;
      review_type: "marketplace" | "buddy";
      reference_id?: string;
    }) => this.post<Review>("/reviews", data),

    getUserReviews: (userId: string, params?: { review_type?: string; page?: number }) => {
      const searchParams = new URLSearchParams();
      if (params?.review_type) searchParams.set("review_type", params.review_type);
      if (params?.page) searchParams.set("page", params.page.toString());
      const query = searchParams.toString();
      return this.get<{ items: Review[]; total: number; average_rating: number }>(`/reviews/user/${userId}${query ? `?${query}` : ""}`);
    },

    getUserRatingSummary: (userId: string) =>
      this.get<{
        user_id: string;
        marketplace_rating: number | null;
        marketplace_count: number;
        buddy_rating: number | null;
        buddy_count: number;
        overall_rating: number | null;
        total_reviews: number;
      }>(`/reviews/user/${userId}/summary`),

    getMyReviews: (direction: "given" | "received", page?: number) => {
      const searchParams = new URLSearchParams();
      searchParams.set("direction", direction);
      if (page) searchParams.set("page", page.toString());
      return this.get<{ items: Review[]; total: number; average_rating: number }>(`/reviews/my-reviews?${searchParams.toString()}`);
    },

    deleteReview: (id: string) => this.delete<void>(`/reviews/${id}`),
  };

  // Reports endpoints
  reports = {
    submitReport: (data: {
      reported_user_id: string;
      reason: string;
      explanation: string;
    }) => this.post<{
      id: string;
      reported_user_id: string;
      reason: string;
      status: string;
      created_at: string;
    }>("/users/report", data),
  };

  // Course chat endpoints
  courses = {
    // Discovery
    getHierarchy: (campus?: string) => {
      const query = campus ? `?campus=${campus}` : "";
      return this.get<CourseHierarchy>(`/courses/hierarchy${query}`);
    },

    search: (q: string, limit = 20) =>
      this.get<{ results: Array<{ id: string; code: string; name: string; faculty: string; year: number; member_count: number }>; total: number }>(
        `/courses/search?q=${encodeURIComponent(q)}&limit=${limit}`
      ),

    getCourse: (courseId: string) => this.get<Course>(`/courses/${courseId}`),

    // Membership
    getMyCourses: () =>
      this.get<{ courses: CourseMembership[] }>("/courses/my/courses"),

    joinCourse: (courseId: string) =>
      this.post<{
        course: Course;
        general_channel: CourseChannel;
        message: string;
      }>(`/courses/${courseId}/join`),

    leaveCourse: (courseId: string) =>
      this.post<{ message: string }>(`/courses/${courseId}/leave`),

    // Channels
    getChannels: (courseId: string) =>
      this.get<{ channels: CourseChannel[] }>(`/courses/${courseId}/channels`),

    joinChannel: (channelId: string) =>
      this.post<{ channel: CourseChannel; message: string }>(
        `/courses/channels/${channelId}/join`
      ),

    // Voting
    getVoteStatus: (courseId: string) =>
      this.get<{ votes: VoteStatus[]; current_semester: string }>(
        `/courses/${courseId}/vote-status`
      ),

    voteForProfessor: (courseId: string, profName: string, semester?: string) =>
      this.post<{
        vote_count: number;
        threshold: number;
        channel_created: boolean;
        channel: CourseChannel | null;
        message: string;
      }>(`/courses/${courseId}/vote-professor`, {
        prof_name: profName,
        semester,
      }),

    // Messages
    getMessages: (channelId: string, params?: { before?: string; limit?: number }) => {
      const searchParams = new URLSearchParams();
      if (params?.before) searchParams.set("before", params.before);
      if (params?.limit) searchParams.set("limit", params.limit.toString());
      const query = searchParams.toString();
      return this.get<{ messages: CourseMessage[]; has_more: boolean }>(
        `/courses/channels/${channelId}/messages${query ? `?${query}` : ""}`
      );
    },

    sendMessage: (channelId: string, message?: string, imageUrl?: string, replyToId?: string) =>
      this.post<CourseMessage>(`/courses/channels/${channelId}/messages`, {
        message: message || null,
        image_url: imageUrl || null,
        reply_to_id: replyToId || null,
      }),

    getChatImageUploadUrl: (filename: string, contentType: string) =>
      this.post<{ upload_url: string; file_url: string; expires_in: number }>(
        "/courses/chat/upload-image",
        { filename, content_type: contentType }
      ),

    getParticipants: (courseId: string) =>
      this.get<{ participants: CourseParticipant[]; total: number }>(
        `/courses/${courseId}/participants`
      ),
  };

  // Dashboard endpoints
  dashboard = {
    getStats: () =>
      this.get<{
        marketplace_listings: number;
        side_quests_active: number;
        total_courses: number;
        vault_posts_today: number;
        total_users: number;
        active_gigs: number;
      }>("/dashboard/stats"),
  };

  // Feedback endpoints
  feedback = {
    submit: (data: { type: "suggestion" | "bug" | "problem" | "other"; subject: string; message: string }) =>
      this.post<{
        feedback: {
          id: string;
          type: string;
          subject: string;
          message: string;
          status: string;
          created_at: string;
        };
        message: string;
      }>("/feedback", data),

    getMyFeedback: (page = 1, perPage = 20) =>
      this.get<{
        items: Array<{
          id: string;
          type: string;
          subject: string;
          message: string;
          status: string;
          admin_response: string | null;
          responded_at: string | null;
          created_at: string;
        }>;
        total: number;
      }>(`/feedback/my?page=${page}&per_page=${perPage}`),
  };

  // Map data endpoints
  map = {
    getBuildings: () =>
      this.get<{
        buildings: Array<{
          id: string;
          name: string;
          category: string;
          coordinates: [number, number][];
          center: [number, number];
        }>;
        cached: boolean;
        source: string;
      }>("/map/buildings"),
  };

  // Quick Gigs endpoints
  gigs = {
    getGigs: (params?: {
      gig_type?: GigType;
      category?: GigCategory;
      min_price?: number;
      max_price?: number;
      location?: GigLocation;
      search?: string;
      sort?: "recent" | "price_low" | "price_high" | "highest_rated";
      page?: number;
      per_page?: number;
    }) => {
      const searchParams = new URLSearchParams();
      if (params?.gig_type) searchParams.set("gig_type", params.gig_type);
      if (params?.category) searchParams.set("category", params.category);
      if (params?.min_price) searchParams.set("min_price", params.min_price.toString());
      if (params?.max_price) searchParams.set("max_price", params.max_price.toString());
      if (params?.location) searchParams.set("location", params.location);
      if (params?.search) searchParams.set("search", params.search);
      if (params?.sort) searchParams.set("sort", params.sort);
      if (params?.page) searchParams.set("page", params.page.toString());
      if (params?.per_page) searchParams.set("per_page", params.per_page.toString());
      const query = searchParams.toString();
      return this.get<{ items: Gig[]; total: number; page: number; per_page: number; has_more: boolean }>(
        `/gigs${query ? `?${query}` : ""}`
      );
    },

    getGig: (id: string) => this.get<Gig>(`/gigs/${id}`),

    createGig: (data: {
      gig_type: GigType;
      category: GigCategory;
      title: string;
      description: string;
      price_min?: number;
      price_max?: number;
      price_type?: GigPriceType;
      location?: GigLocation;
      location_details?: string;
      deadline?: string;
    }) => this.post<Gig>("/gigs", data),

    updateGig: (id: string, data: Partial<{
      title: string;
      description: string;
      price_min: number;
      price_max: number;
      price_type: GigPriceType;
      location: GigLocation;
      location_details: string;
      deadline: string;
      status: GigStatus;
    }>) => this.patch<Gig>(`/gigs/${id}`, data),

    deleteGig: (id: string) => this.delete<void>(`/gigs/${id}`),

    respondToGig: (gigId: string, data: { message?: string; proposed_price?: number }) =>
      this.post<GigResponse>(`/gigs/${gigId}/respond`, data),

    getResponses: (gigId: string) =>
      this.get<{ items: GigResponse[]; total: number }>(`/gigs/${gigId}/responses`),

    acceptResponse: (gigId: string, responseId: string) =>
      this.post<{ success: boolean; message: string; response_id: string; status: string; transaction_id: string }>(
        `/gigs/${gigId}/responses/${responseId}/accept`
      ),

    rejectResponse: (gigId: string, responseId: string) =>
      this.post<{ success: boolean; message: string; response_id: string; status: string }>(
        `/gigs/${gigId}/responses/${responseId}/reject`
      ),

    completeGig: (gigId: string) =>
      this.post<{ success: boolean; message: string; transaction_id: string; both_confirmed: boolean; status: string }>(
        `/gigs/${gigId}/complete`
      ),

    rateTransaction: (transactionId: string, data: {
      rating: number;
      reliability: number;
      communication: number;
      quality: number;
      review_text?: string;
    }) => this.post<GigRating>(`/gigs/transactions/${transactionId}/rate`, data),

    getMyGigs: (type?: "posted" | "responded" | "all") => {
      const query = type ? `?type=${type}` : "";
      return this.get<{ posted?: Gig[]; responded?: GigResponse[] }>(`/gigs/my-gigs${query}`);
    },

    getUserGigProfile: (userId: string) =>
      this.get<GigProfile>(`/gigs/users/${userId}/profile`),

    getTransactions: (params?: {
      status?: "pending" | "completed" | "disputed";
      page?: number;
      per_page?: number;
    }) => {
      const searchParams = new URLSearchParams();
      if (params?.status) searchParams.set("status", params.status);
      if (params?.page) searchParams.set("page", params.page.toString());
      if (params?.per_page) searchParams.set("per_page", params.per_page.toString());
      const query = searchParams.toString();
      return this.get<{ items: GigTransaction[]; total: number; page: number; per_page: number; has_more: boolean }>(
        `/gigs/transactions${query ? `?${query}` : ""}`
      );
    },
  };

  // Admin endpoints
  admin = {
    getUsers: (page = 1, perPage = 50, search?: string, sortBy: "last_login" | "created" = "last_login") => {
      const params = new URLSearchParams({ page: String(page), per_page: String(perPage), sort_by: sortBy });
      if (search) params.set("search", search);
      return this.get<{
        items: Array<{
          id: string;
          name: string;
          email: string;
          is_admin: boolean;
          is_banned: boolean;
          created_at: string | null;
          last_login_at: string | null;
          last_login_ip: string | null;
        }>;
        total: number;
        page: number;
        per_page: number;
        has_more: boolean;
      }>(`/auth/admin/users?${params.toString()}`);
    },

    deleteUser: (userId: string) =>
      this.delete<void>(`/auth/admin/users/${userId}`),

    getSignupAttempts: (page = 1, perPage = 50, ip?: string) => {
      const params = new URLSearchParams({ page: String(page), per_page: String(perPage) });
      if (ip) params.set("ip", ip);
      return this.get<{
        items: Array<{ id: string; email: string; ip_address: string; attempted_at: string; was_blocked: boolean }>;
        total: number; page: number; per_page: number; has_more: boolean;
      }>(`/auth/admin/signup-attempts?${params.toString()}`);
    },

    getVaultPosts: (page = 1, perPage = 50) =>
      this.get<{
        items: Array<{
          id: string;
          title: string;
          category: string;
          status: string;
          is_anonymous: boolean;
          flag_count: number;
          author: { id: string; name: string } | null;
          created_at: string | null;
        }>;
        total: number;
        page: number;
        per_page: number;
        has_more: boolean;
      }>(`/vault/admin/posts?page=${page}&per_page=${perPage}`),

    deleteVaultPost: (postId: string) =>
      this.delete<void>(`/vault/admin/posts/${postId}`),

    getVaultPostComments: (postId: string) =>
      this.get<{ items: Array<{ id: string; content: string; is_anonymous: boolean; is_hidden: boolean; author: { id: string; name: string; avatar_url: string | null } | null; created_at: string | null }>; total: number }>(`/vault/admin/posts/${postId}/comments`),

    getListings: (page = 1, perPage = 50) =>
      this.get<{
        items: Array<{
          id: string;
          title: string;
          price: number;
          category: string;
          status: string;
          seller: { id: string; name: string } | null;
          created_at: string | null;
        }>;
        total: number;
        page: number;
        per_page: number;
        has_more: boolean;
      }>(`/marketplace/admin/listings?page=${page}&per_page=${perPage}`),

    deleteListing: (listingId: string) =>
      this.delete<void>(`/marketplace/admin/listings/${listingId}`),

    getFeedback: (page = 1, perPage = 50) =>
      this.get<{
        items: Array<{
          id: string;
          type: string;
          subject: string;
          message: string;
          status: string;
          admin_response: string | null;
          responded_at: string | null;
          created_at: string;
          user: { id: string; name: string; email: string };
        }>;
        total: number;
      }>(`/feedback/admin?page=${page}&per_page=${perPage}`),

    resolveFeedback: (feedbackId: string) =>
      this.patch<void>(`/feedback/admin/${feedbackId}/resolve`, {}),

    deleteFeedback: (feedbackId: string) =>
      this.delete<void>(`/feedback/admin/${feedbackId}`),

    getQuests: (page = 1, perPage = 50) =>
      this.get<{
        items: Array<{
          id: string;
          title: string;
          category: string;
          status: string;
          host: { id: string; name: string } | null;
          created_at: string | null;
        }>;
        total: number;
        page: number;
        per_page: number;
        has_more: boolean;
      }>(`/quests/admin/quests?page=${page}&per_page=${perPage}`),

    deleteQuest: (questId: string) =>
      this.delete<void>(`/quests/admin/quests/${questId}`),

    getReports: (page = 1, perPage = 50) =>
      this.get<{
        items: Array<{
          id: string;
          reporter: { id: string; name: string; avatar_url: string | null };
          reported_user: { id: string; name: string; avatar_url: string | null };
          reason: string;
          explanation: string;
          status: string;
          admin_notes: string | null;
          created_at: string;
        }>;
        total: number;
        page: number;
        per_page: number;
        has_more: boolean;
      }>(`/admin/reports?page=${page}&per_page=${perPage}`),

    getCourseOverview: () =>
      this.get<{
        total_courses: number;
        total_members: number;
        total_messages: number;
        top_courses: Array<{
          id: string;
          code: string;
          name: string;
          faculty: string;
          member_count: number;
          message_count: number;
          channel_count: number;
        }>;
      }>(`/courses/admin/overview`),

    getCourseMessages: (page = 1, perPage = 50) =>
      this.get<{
        items: Array<{
          id: string;
          message: string | null;
          image_url: string | null;
          created_at: string;
          user_id: string;
          user_name: string;
          user_email: string;
          channel_name: string;
          course_code: string;
          course_name: string;
        }>;
        total: number;
        page: number;
        per_page: number;
        has_more: boolean;
      }>(`/courses/admin/messages?page=${page}&per_page=${perPage}`),

    deleteCourseMessage: (messageId: string) =>
      this.delete<void>(`/courses/admin/messages/${messageId}`),

    getCourseVotes: () =>
      this.get<{
        votes: Array<{
          course_code: string;
          course_name: string;
          prof_name: string;
          semester: string;
          vote_count: number;
          threshold: number;
        }>;
      }>(`/courses/admin/votes`),
  };

  // Residences chat endpoints
  residences = {
    list: () =>
      this.get<{ keele: Residence[]; glendon: Residence[] }>("/residences/list"),

    getMyResidences: () =>
      this.get<{ residences: ResidenceMembership[] }>("/residences/my/residences"),

    join: (residenceId: string) =>
      this.post<{ residence: Residence; channel: ResidenceChannel; message: string }>(
        `/residences/${residenceId}/join`
      ),

    leave: (residenceId: string) =>
      this.post<{ message: string }>(`/residences/${residenceId}/leave`),

    getChannel: (residenceId: string) =>
      this.get<ResidenceChannel>(`/residences/${residenceId}/channel`),

    getMessages: (channelId: string, params?: { before?: string; limit?: number }) => {
      const searchParams = new URLSearchParams();
      if (params?.before) searchParams.set("before", params.before);
      if (params?.limit) searchParams.set("limit", params.limit.toString());
      const query = searchParams.toString();
      return this.get<{ messages: ResidenceMessage[]; has_more: boolean }>(
        `/residences/channels/${channelId}/messages${query ? `?${query}` : ""}`
      );
    },

    sendMessage: (channelId: string, message?: string, imageUrl?: string, replyToId?: string) =>
      this.post<ResidenceMessage>(`/residences/channels/${channelId}/messages`, {
        message: message || null,
        image_url: imageUrl || null,
        reply_to_id: replyToId || null,
      }),

    getChatImageUploadUrl: (filename: string, contentType: string) =>
      this.post<{ upload_url: string; file_url: string; expires_in: number }>(
        "/residences/chat/upload-image",
        { filename, content_type: contentType }
      ),

    getParticipants: (residenceId: string) =>
      this.get<{ participants: ResidenceParticipant[]; total: number }>(
        `/residences/${residenceId}/participants`
      ),

    seed: () =>
      this.post<{ residences_created: number; channels_created: number; message: string }>(
        "/residences/admin/seed"
      ),
  };
  // Push notification endpoints
  push = {
    subscribe: (data: { endpoint: string; p256dh: string; auth: string }) =>
      this.post<{ message: string }>("/push/subscribe", data),

    unsubscribe: (endpoint: string) =>
      this.post<void>("/push/unsubscribe", { endpoint }),
  };

  // Admin persona endpoints
  adminPersonas = {
    listPersonas: () =>
      this.get<import("@/types").PersonaUser[]>("/admin/personas"),

    createPersona: (data: { name: string; program?: string; bio?: string }) =>
      this.post<import("@/types").PersonaUser>("/admin/personas", data),

    deactivatePersona: (id: string) =>
      this.delete<void>(`/admin/personas/${id}`),

    createPersonaQuest: (personaId: string, data: {
      category: string;
      activity: string;
      description?: string;
      start_time: string;
      location: string;
      vibe_level: string;
      max_participants: number;
      requires_approval: boolean;
      custom_category?: string;
      custom_vibe_level?: string;
    }) =>
      this.post<import("@/types").SideQuest>(`/admin/personas/${personaId}/quests`, data),

    listPendingRequests: () =>
      this.get<import("@/types").PendingRequestItem[]>("/admin/personas/quest-requests"),

    decideJoinRequest: (questId: string, participantId: string, action: "accept" | "reject") =>
      this.post<import("@/types").QuestParticipant>(
        `/admin/quests/${questId}/participants/${participantId}/decide`,
        { action }
      ),

    listPersonaConversations: () =>
      this.get<import("@/types").PersonaConversationItem[]>("/admin/personas/conversations"),

    getConversationMessages: (convId: string) =>
      this.get<{ messages: import("@/types").Message[]; has_more: boolean }>(
        `/messages/conversations/${convId}/messages`
      ),

    replyAsPersona: (convId: string, personaId: string, content: string) =>
      this.post<import("@/types").Message>(
        `/admin/conversations/${convId}/reply-as/${personaId}`,
        { content }
      ),
  };

  // Activity tracking — see <ActivityTracker /> (providers.tsx) and the
  // "Privacy & Activity" section of the profile page. No-ops server-side
  // when settings.activity_tracking_enabled is False.
  analytics = {
    startSession: (data: { device_type?: string; browser?: string; landing_path?: string }) =>
      this.post<{ session_id: string }>("/analytics/sessions", data),

    trackEvents: (
      sessionId: string,
      events: Array<{
        event_type: string;
        category: string;
        entity_type?: string;
        entity_id?: string;
        properties?: Record<string, unknown>;
        occurred_at?: string;
      }>
    ) => this.post<{ accepted: number }>("/analytics/events", { session_id: sessionId, events }),

    recordReplayChunk: (sessionId: string, chunk: unknown, byteSize: number) =>
      this.post<{ recorded: boolean }>(`/analytics/sessions/${sessionId}/replay-chunk`, {
        session_id: sessionId,
        chunk,
        byte_size: byteSize,
      }),

    setConsent: (data: { policy_version: string; consent_scope: string; action: "granted" | "withdrawn" }) =>
      this.post<{ id: string; consent_scope: string; action: string; recorded_at: string }>(
        "/analytics/consent",
        data
      ),

    getConsentStatus: () =>
      this.get<{ product_analytics: boolean; session_replay: boolean }>("/analytics/consent/status"),

    // Admin
    listActivityProfiles: (page = 1, perPage = 50, sortBy = "engagement_score") =>
      this.get<{ items: unknown[]; total: number; page: number; per_page: number; has_more: boolean }>(
        `/admin/activity/profiles?page=${page}&per_page=${perPage}&sort_by=${sortBy}`
      ),

    getActivityProfile: (userId: string) =>
      this.get<{ profile: unknown; recent_events: unknown[] }>(`/admin/activity/profiles/${userId}`),
  };

  // AI Ignite club tracker (sandbox account only)
  ignite = {
    listMembers: (includeInactive = false) =>
      this.get<IgniteMember[]>(`/ignite/members?include_inactive=${includeInactive}`),
    unlockMembers: (passcode: string) => this.post<void>("/ignite/members/unlock", { passcode }),
    createMember: (data: MemberInput) => this.post<IgniteMember>("/ignite/members", data),
    updateMember: (id: string, data: MemberInput) =>
      this.patch<IgniteMember>(`/ignite/members/${id}`, data),
    listProjects: () => this.get<IgniteProject[]>("/ignite/projects"),
    createProject: (data: ProjectInput) => this.post<IgniteProject>("/ignite/projects", data),
    updateProject: (id: string, data: ProjectInput) => this.patch<IgniteProject>(`/ignite/projects/${id}`, data),
    listTasks: () => this.get<IgniteTask[]>("/ignite/tasks"),
    createTask: (data: TaskInput) => this.post<IgniteTask>("/ignite/tasks", data),
    updateTask: (id: string, data: TaskInput) => this.patch<IgniteTask>(`/ignite/tasks/${id}`, data),
    deleteTask: (id: string) => this.delete<void>(`/ignite/tasks/${id}`),
  };
}

export const api = new ApiClient(API_URL);
