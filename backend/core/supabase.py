from config import SUPABASE_URL, SUPABASE_KEY

try:
    from supabase import create_client, Client
except ImportError:
    create_client = None
    Client = None

supabase: Client | None = None
if create_client and SUPABASE_URL and SUPABASE_KEY:
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
