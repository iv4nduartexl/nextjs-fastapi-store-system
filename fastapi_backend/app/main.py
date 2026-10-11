from contextlib import asynccontextmanager

from fastapi import Depends, FastAPI
from fastapi_pagination import add_pagination
from .schemas import UserRead
from .users import auth_backend, fastapi_users, AUTH_URL_PATH
from fastapi.middleware.cors import CORSMiddleware
from .utils import simple_generate_unique_route_id
from app.routes.items import router as items_router
from app.routes.sales import router as sales_router
from app.routes.purchases import router as purchases_router
from app.routes.customers import router as customers_router
from app.routes.cashbox import router as cashbox_router
from app.routes.categories import router as categories_router
from app.routes.suppliers import router as suppliers_router
from app.routes.chat import router as chat_router
from app.routes.ai_settings import router as ai_settings_router
from app.routes.assistant_tools import router as assistant_tools_router
from app.routes.account import router as account_router
from app.routes.business import router as business_router
from app.routes.admin import router as admin_router
from app.database import async_session_maker
from app.superuser import sync_superuser
from app.login_limits import login_rate_limit
from app.mcp_tools import ALLOWED_OPERATIONS, apply_tool_descriptions
from app.config import settings
from fastapi_mcp import FastApiMCP

@asynccontextmanager
async def lifespan(_: FastAPI):
    async with async_session_maker() as session:
        await sync_superuser(session)
    yield


app = FastAPI(
    generate_unique_id_function=simple_generate_unique_route_id,
    openapi_url=settings.OPENAPI_URL,
    lifespan=lifespan,
)

# Middleware for CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include authentication and user management routes
app.include_router(
    fastapi_users.get_auth_router(auth_backend),
    prefix=f"/{AUTH_URL_PATH}/jwt",
    tags=["auth"],
    # Throttles repeated failed sign-ins (no-op for logout)
    dependencies=[Depends(login_rate_limit)],
)
# No public registration: the superuser creates businesses and owners create their team
app.include_router(
    fastapi_users.get_reset_password_router(),
    prefix=f"/{AUTH_URL_PATH}",
    tags=["auth"],
)
app.include_router(
    fastapi_users.get_verify_router(UserRead),
    prefix=f"/{AUTH_URL_PATH}",
    tags=["auth"],
)
# /users/me and /auth/change-password (fastapi-users' /users/{id} admin routes are replaced by /admin)
app.include_router(account_router)

# Include items routes
app.include_router(items_router, prefix="/items")
app.include_router(sales_router, prefix="/sales")
app.include_router(purchases_router, prefix="/purchases")
app.include_router(customers_router, prefix="/customers")
app.include_router(cashbox_router, prefix="/cashbox")
app.include_router(categories_router, prefix="/categories")
app.include_router(suppliers_router, prefix="/suppliers")
app.include_router(chat_router, prefix="/chat")
app.include_router(ai_settings_router, prefix="/ai-settings")
app.include_router(assistant_tools_router, prefix="/assistant")
app.include_router(business_router, prefix="/business")
app.include_router(admin_router, prefix="/admin")
add_pagination(app)

# Expose only the store operations the chat assistant needs (no auth/users/chat routes)
apply_tool_descriptions(app)
mcp = FastApiMCP(app, include_operations=ALLOWED_OPERATIONS)
mcp.mount()

app.state.mcp = mcp 
