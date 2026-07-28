# Airline Operation Suite (AOS)

Airline Operation Suite system with Flask backend and frontend components.

## Database Setup

The database script containing all Oracle SQL DDL tables, sequences, seed data, and PL/SQL stored procedures is located at:
- [`database/schema.sql`](file:///d:/SOFTWERE/AOS_V9/database/schema.sql)

### Included Database Components:
- **Master & Transaction Tables**: Users, Roles, User-Role Mapping, Menus, Role-Menu Mapping, Cities, Airports, Flight Companies, Passengers, Flights, Dynamic Prices, Ticket Bookings, and Log Tables.
- **Sequences**: Primary key auto-increment sequences for all master and transaction entities.
- **Initial Seed Data**: Default system admin/operator accounts, initial roles, and menu mappings.
- **PL/SQL Stored Procedures**: Complete set of `*_USP` procedures for user authentication, role assignment, menu fetching, airport/city management, passenger registration, and operational metrics.

