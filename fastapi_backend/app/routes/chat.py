import os
import json
import re
from fastapi import APIRouter, Depends, Request, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.future import select
from openai import OpenAI
from fastapi_mcp.types import HTTPRequestInfo

from app.users import current_active_user
from app.database import User, get_async_session
from app.models import (
    Item, Customer, Supplier, Purchase, PurchaseItem, Sale, SaleItem,
    CashboxSession, CashboxTransaction, Category, QuantityDiscountRule
)
from sqlalchemy import select, func
from app.config import settings

router = APIRouter(tags=["chat"])

def get_deepseek_client():
    return OpenAI(
        base_url="https://openrouter.ai/api/v1",
        api_key=settings.OPENROUTER_API_KEY
    )

def extract_ai_reply(response) -> str:
    if not response or not hasattr(response, 'choices') or not response.choices:
        return str(response)
    choice = response.choices[0]
    if hasattr(choice, 'message') and choice.message:
        if hasattr(choice.message, 'content') and choice.message.content:
            return choice.message.content
        if hasattr(choice.message, 'reasoning') and choice.message.reasoning:
            return choice.message.reasoning
    return "El modelo completó la operación."


async def enrich_tool_args(tool_name: str, tool_args: dict, db: AsyncSession) -> dict:
    """Enrich tool arguments with human-readable information."""
    enriched = tool_args.copy()
    
    try:
        # Sales creation/update - enrich items with names, prices
        if "items" in enriched and isinstance(enriched["items"], list):
            item_ids = [str(it.get("item_id")) for it in enriched["items"] if it.get("item_id")]
            if item_ids:
                result = await db.execute(
                    select(Item.id, Item.name, Item.price, Item.sku, Item.category, Item.unit_type)
                    .where(Item.id.in_(item_ids))
                )
                items_db = {str(r.id): {"name": r.name, "price": float(r.price) if r.price else 0, "sku": r.sku, "category": r.category, "unit_type": r.unit_type.value if r.unit_type else "unit"} for r in result.all()}
                
                for it in enriched["items"]:
                    iid = str(it.get("item_id"))
                    if iid in items_db:
                        it["item_name"] = items_db[iid]["name"]
                        it["item_sku"] = items_db[iid]["sku"]
                        it["item_category"] = items_db[iid]["category"]
                        it["unit_type"] = items_db[iid]["unit_type"]
                        it["price"] = items_db[iid]["price"]
                        it["total_price"] = items_db[iid]["price"] * float(it.get("quantity", 1))

        # Customer enrichment
        if "customer_id" in enriched and enriched["customer_id"]:
            cid = enriched["customer_id"]
            result = await db.execute(select(Customer.name, Customer.phone, Customer.email).where(Customer.id == cid))
            cust = result.first()
            if cust:
                enriched["customer_name"] = cust.name
                enriched["customer_phone"] = cust.phone
                enriched["customer_email"] = cust.email

        # Supplier enrichment
        if "supplier_id" in enriched and enriched["supplier_id"]:
            sid = enriched["supplier_id"]
            result = await db.execute(select(Supplier.name, Supplier.phone, Supplier.email).where(Supplier.id == sid))
            supp = result.first()
            if supp:
                enriched["supplier_name"] = supp.name
                enriched["supplier_phone"] = supp.phone
                enriched["supplier_email"] = supp.email

        # Category enrichment
        if "category" in enriched and enriched["category"]:
            cat = enriched["category"]
            result = await db.execute(select(Category.name).where(Category.name == cat))
            cat_db = result.scalar_one_or_none()
            if cat_db:
                enriched["category_name"] = cat_db

        # Purchase items enrichment
        if "items" in enriched and isinstance(enriched["items"], list) and "supplier_id" in enriched:
            # This is likely a purchase - use cost_price instead of price
            item_ids = [str(it.get("item_id")) for it in enriched["items"] if it.get("item_id")]
            if item_ids:
                result = await db.execute(
                    select(Item.id, Item.name, Item.price, Item.sku, Item.category).where(Item.id.in_(item_ids))
                )
                items_db = {str(r.id): {"name": r.name, "price": float(r.price) if r.price else 0, "sku": r.sku, "category": r.category} for r in result.all()}
                
                for it in enriched["items"]:
                    iid = str(it.get("item_id"))
                    if iid in items_db:
                        it["item_name"] = items_db[iid]["name"]
                        it["item_sku"] = items_db[iid]["sku"]
                        it["item_category"] = items_db[iid]["category"]
                        if "cost_price" in it:
                            it["total_cost"] = float(it["cost_price"]) * float(it.get("quantity", 1))

        # Payment method human-readable
        if "payment_method" in enriched:
            method_map = {
                "cash": "Efectivo",
                "card": "Tarjeta",
                "transfer": "Transferencia",
                "credit": "Crédito",
                "internal": "Interno",
                "other": "Otro"
            }
            enriched["payment_method_label"] = method_map.get(enriched["payment_method"], enriched["payment_method"])

        # Sale status human-readable
        if "status" in enriched:
            status_map = {
                "completed": "Completada",
                "cancelled": "Cancelada",
                "refunded": "Reembolsada"
            }
            enriched["status_label"] = status_map.get(enriched["status"], enriched["status"])

        # Item fields for create/update
        if any(k in enriched for k in ["name", "description", "sku", "category", "unit_type", "stock", "min_stock", "price"]):
            enriched["operation_type"] = "item_management"

    except Exception as enrichment_error:
        print(f"Error enriching tool args: {enrichment_error}")
    
    return enriched

@router.post("")
async def chat_with_mcp(
    request: Request, 
    payload: dict, 
    user: User = Depends(current_active_user),
    db: AsyncSession = Depends(get_async_session)
):
    user_message = payload.get("message")
    print("🚀 ~ DeepSeek Chat ~ Mensaje inicial recibido:", user_message)
    
    auth_header = request.headers.get("Authorization")
    custom_headers = {"authorization": auth_header} if auth_header else {}
    
    http_info = HTTPRequestInfo(
        method="POST",
        path=str(request.url.path),
        headers=custom_headers,
        cookies=dict(request.cookies),
        query_params=dict(request.query_params),
        body=None
    )
    
    client = get_deepseek_client()
    mcp = request.app.state.mcp

    # Helper to check if a tool requires approval
    def requires_approval(tool_name: str) -> bool:
        op = mcp.operation_map.get(tool_name)
        if not op:
            return False
        
        # Look for 'method' in dict or object
        method = None
        if hasattr(op, "method"):
            method = getattr(op, "method")
        elif isinstance(op, dict) and "method" in op:
            method = op["method"]
            
        if not method:
            return False
            
        return str(method).upper() in ["POST", "PATCH", "PUT", "DELETE"]
    
    openai_tools = [
        {
            "type": "function",
            "function": {
                "name": tool.name,
                "description": tool.description,
                "parameters": tool.inputSchema
            }
        }
        for tool in mcp.tools
    ]

    # Guardamos el historial de la conversación para este ciclo
    messages = [{"role": "user", "content": user_message}]

    try:
        # ─── BUCLE DINÁMICO PARA PERMITIR MÚLTIPLES LLAMADAS EN CADENA (Ej: Buscar -> Crear Venta) ───
        for _ in range(5):  # Máximo 5 llamadas encadenadas para evitar bucles infinitos
            response = client.chat.completions.create(
                model="~deepseek/deepseek-v4-flash-latest", 
                messages=messages,
                tools=openai_tools if openai_tools else None
            )
            
            message = response.choices[0].message
            
            # Si el modelo no quiere usar más herramientas, terminamos y respondemos al usuario
            if not message.tool_calls:
                ai_reply = extract_ai_reply(response)
                print("🤖 DeepSeek respuesta final:", ai_reply)
                return {"reply": ai_reply}
            
            # Si quiere usar herramientas, las ejecutamos y guardamos el resultado en el historial
            messages.append(message)  # Añadimos la intención del modelo al historial
            
            for tool_call in message.tool_calls:
                tool_name = tool_call.function.name
                tool_args = json.loads(tool_call.function.arguments)

                # Check if this tool requires approval
                if requires_approval(tool_name):
                    print(f"⚠️ Approval required for tool: {tool_name}")
                    
                    # Enrich args with human-readable details based on tool type
                    enriched_args = await enrich_tool_args(tool_name, tool_args, db)

                    return {
                        "reply": f"He preparado la operación '{tool_name}'. ¿Deseas ejecutarla?",
                        "toolCall": {
                            "id": tool_call.id,
                            "name": tool_name,
                            "args": enriched_args
                        }
                    }

                print(f"🎯 DeepSeek solicitó ejecutar: {tool_name} con argumentos: {tool_args}")
                
                # Ejecución interna de tu API
                tool_result = await mcp._execute_api_tool(
                    client=mcp._http_client,
                    tool_name=tool_name,
                    arguments=tool_args,
                    operation_map=mcp.operation_map,
                    http_request_info=http_info
                )
                print(f"📦 Resultado de la base de datos para {tool_name}: {tool_result}")
                
                # Le devolvemos el resultado de la DB al modelo dentro del historial
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": tool_name,
                    "content": str(tool_result),
                })
                
        # Si llega al límite de ciclos de herramientas
        return {"reply": "Se completaron las operaciones en la base de datos correctamente."}

    except Exception as e:
        print("❌ Error en el cliente DeepSeek:", str(e))
        return {"reply": f"Ocurrió un error al conectar con DeepSeek: {str(e)}"}

@router.post("/execute")
async def execute_tool(request: Request, payload: dict, user: User = Depends(current_active_user)):
    tool_name = payload.get("name")
    tool_args = payload.get("args")
    
    if not tool_name:
        raise HTTPException(status_code=400, detail="Tool name is required")

    auth_header = request.headers.get("Authorization")
    custom_headers = {"authorization": auth_header} if auth_header else {}
    
    http_info = HTTPRequestInfo(
        method="POST",
        path=str(request.url.path),
        headers=custom_headers,
        cookies=dict(request.cookies),
        query_params=dict(request.query_params),
        body=None
    )
    
    mcp = request.app.state.mcp

    try:
        print(f"✅ Executing approved tool: {tool_name} with arguments: {tool_args}")
        tool_result = await mcp._execute_api_tool(
            client=mcp._http_client,
            tool_name=tool_name,
            arguments=tool_args,
            operation_map=mcp.operation_map,
            http_request_info=http_info
        )
        return {"reply": f"Operación '{tool_name}' completada con éxito.", "result": tool_result}
    except Exception as e:
        print(f"❌ Error executing approved tool {tool_name}:", str(e))
        return {"reply": f"Error al ejecutar la operación: {str(e)}"}

