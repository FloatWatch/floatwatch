from pydantic import BaseModel, ConfigDict, EmailStr, Field


class RegisterBody(BaseModel):
    name: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginBody(BaseModel):
    email: EmailStr
    password: str


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=2, max_length=80)


class PasswordChange(BaseModel):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=8, max_length=128)


class AccountDelete(BaseModel):
    confirmation: str
    current_password: str | None = Field(default=None, max_length=128)


class AnalysisCreate(BaseModel):
    model_id: int
    video_id: int
    confidence: float = Field(default=0.25, ge=0.05, le=0.95)
    frame_stride: int = Field(default=1, ge=1, le=30)


class ContentCreate(BaseModel):
    category: str = Field(pattern="^(free|notice|faq)$")
    title: str = Field(min_length=2, max_length=200)
    content: str = Field(min_length=2, max_length=20000)
    pinned: bool = False


class ContentUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    content: str | None = Field(default=None, min_length=2, max_length=20000)
    pinned: bool | None = None


class CommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)


class InquiryCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    content: str = Field(min_length=2, max_length=10000)


class InquiryAnswer(BaseModel):
    answer: str = Field(min_length=2, max_length=10000)
    reason: str = Field(default="문의 답변 처리", min_length=2, max_length=500)


class UserAdminUpdate(BaseModel):
    role: str | None = Field(default=None, pattern="^(user|admin)$")
    active: bool | None = None
    reason: str = Field(min_length=2, max_length=500)


class OrmModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)
