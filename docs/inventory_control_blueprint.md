# Blueprint & Technical Specification: Production MRP & Inventory Control System

This document outlines the architectural blueprint, data schema, and system logic for transitioning your inventory control from Excel to a mobile-first web application.

---

## 1. System Core Logic & Math Formulations

The system automates the transition from production forecasts to raw material procurement while accounting for batch sizes, yields, and supplier packaging constraints.

### Key Formulas & Logic Flows

#### A. Total Available Inventory
$$	ext{Total Available Stock} = 	ext{In-Hand Inventory} + 	ext{Pipeline Inventory}$$

#### B. Maximum Production Capacity (Limiting Factor)
Calculated per finished good based on the most restrictive ingredient in stock:
$$	ext{Max Batches Quantized} = \min_{i \in 	ext{Recipe}} \left( rac{	ext{Total Available Stock}_i}{	ext{Recipe Requirement Per Batch}_i} ight)$$
$$	ext{Max Cases Capable} = \lfloor 	ext{Max Batches Quantized} 	imes 	ext{Units Per Batch} floor / 	ext{Units Per Case}$$

#### C. Net Material Procurement Requirement
Driven directly by the **Production Forecast Input**:
$$	ext{Gross Required Material}_i = 	ext{Forecasted Batches} 	imes 	ext{Recipe Requirement Per Batch}_i$$
$$	ext{Net Deficit}_i = 	ext{Gross Required Material}_i - 	ext{Total Available Stock}_i$$

#### D. Smart Procurement Rounding (Packaging Size Constraints)
If $	ext{Net Deficit}_i > 0$, the system calculates order volume based on the statically mapped $	ext{Packaging Size}_i$:
$$	ext{Raw Order Units} = \lceil rac{	ext{Net Deficit}_i}{	ext{Packaging Size}_i} ceil$$
$$	ext{Final Order Volume (Kgs/Pcs)} = 	ext{Raw Order Units} 	imes 	ext{Packaging Size}_i$$

---

## 2. Relational Database Schema (SQL-Standard)

To support multiple products, distinct recipe definitions, and multi-user access control, the system utilizes the following relational database structure:

```sql
-- 1. Role-Based Access Control (RBAC)
CREATE TABLE roles (
    id SERIAL PRIMARY KEY,
    name VARCHAR(50) UNIQUE NOT NULL -- 'Admin', 'Warehouse', 'Production'
);

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role_id INT REFERENCES roles(id) NOT NULL
);

-- 2. Material Management
CREATE TABLE ingredients (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) UNIQUE NOT NULL,
    cost_per_kg_pc DECIMAL(10, 2) NOT NULL,
    pack_size_kg_pc DECIMAL(10, 2) NOT NULL, -- Static packing configuration input once
    par_level_kg_pc DECIMAL(10, 2) NOT NULL,
    in_hand_qty DECIMAL(12, 3) DEFAULT 0.000,
    pipeline_qty DECIMAL(12, 3) DEFAULT 0.000
);

-- 3. Product & Recipe (BOM) Architecture
CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(150) UNIQUE NOT NULL,
    units_per_batch INT NOT NULL,
    units_per_case INT NOT NULL
);

CREATE TABLE recipes (
    id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(id) ON DELETE CASCADE,
    ingredient_id INT REFERENCES ingredients(id),
    ingredient_percentage DECIMAL(5, 2) NOT NULL, -- Percentage mapping
    qty_per_batch_kg_pc DECIMAL(10, 3) NOT NULL, -- Absolute weight/count per batch
    CONSTRAINT unique_product_ingredient UNIQUE(product_id, ingredient_id)
);

-- 4. Production Forecasting & Ordering
CREATE TABLE production_forecasts (
    id SERIAL PRIMARY KEY,
    product_id INT REFERENCES products(id),
    forecasted_batches INT NOT NULL,
    target_date DATE NOT NULL,
    created_by INT REFERENCES users(id)
);
```

---

## 3. Role-Based Access Control Matrix

| System Action | Admin | Warehouse Team | Production Team |
| :--- | :---: | :---: | :---: |
| **Configure System Rules** (Create Users, Edit Formulations) |  Yes | ❌ No | ❌ No |
| **Manage Master Recipes** (Set Ingredients, Costs, % Mix) |  Yes | ❌ No | ❌ No |
| **Adjust Par Levels & Packing Sizes** |  Yes | ❌ No | ❌ No |
| **Log Physical Stock** (Update In-Hand Inventory) |  Yes |  Yes | ❌ No |
| **Input Production Data** (Forecasts, Batches Processed) |  Yes | ❌ No |  Yes |
| **View Low-Stock Alerts & Generate Purchase Orders** |  Yes |  Yes |  Yes |

---

## 4. Mobile UI/UX Interface Architecture

Designed for single-hand operations on warehouse and production floors.

### A. Dashboard View (All Roles)
* **Global Search Bar:** Instantly query recipes or raw materials.
* **Alert Feed:** Prominent high-contrast badges showing items below threshold:
  * ⚠️ *Alert:* Sugar In-Hand + Pipeline ($450	ext{ kg}$) is below Par ($500	ext{ kg}$).
* **Quick Action Buttons:** Large touch targets tailored to the authenticated role.

### B. Warehouse View (Stock Upkeep)
* Simple tabular rows with quick-increment buttons (`+` / `-`) optimized for mobile inputs.
* Split fields for **In-Hand** vs. **Pipeline (Ordered but pending delivery)** status tracking.

### C. Production & Forecast Planner
* Single-field numeric interface for adding planned batch sizes.
* Real-time calculation previews showing immediate cascading impact on raw material allocation before committing the plan.
