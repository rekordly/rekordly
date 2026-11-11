# Rekordly Design System — Selection & Input Components Guide

**Status:** Authoritative  
**Target:** HeroUI v3 & Rekordly Design Language  
**Components:** `AppComboBox`, `AppAutocomplete`, `AppPickerSheet`

---

## 1. Executive Selection Matrix

| Component | Trigger & Rest State | Input Behavior | Free-Text / Custom Value | Primary Use Cases |
|---|---|---|---|---|
| **`AppComboBox`** | Inline text `<Input>` visible directly on page | Type immediately into field without opening menu | **Yes** (`allowsCustomValue={true}`) | **Customer / Supplier selector** (select existing or type new on-the-fly), quick line item entry |
| **`AppAutocomplete`** | Button trigger (looks like `<Select>` at rest) | Clicking trigger opens Popover with dedicated `SearchField` | **No** (strictly enforces selection from list) | **Country / Currency picker**, **Money Accounts**, **Outlets / Locations**, Tax rates |
| **`AppPickerSheet`** *(Professions Picker)* | Button trigger with rich chip / label | Opens bottom sheet on mobile or modal on desktop with categorized sections | **Optional** | **Expense Categories**, Chart of Accounts, multi-category item catalogs |

---

## 2. Component Guidelines & Anatomy

### 2.1 `AppComboBox` (Inline Typing + Custom Creation)
- **When to choose:**
  - Choose `AppComboBox` when users expect to type immediately into a form field without an initial click.
  - When you want to allow custom user-entered values (`allowsCustomValue={true}`) such as recording a sale or invoice for a customer who is not yet saved in the directory.
  - When migrating from HeroUI v2's Autocomplete while keeping the same fast UX.
- **Anatomy in HeroUI v3:**
  ```tsx
  <ComboBox allowsCustomValue={true} ...>
    <Label>{label}</Label>
    <ComboBox.InputGroup>
      <Input placeholder={placeholder} />
      <ComboBox.Trigger />
    </ComboBox.InputGroup>
    <ComboBox.Popover>
      <ListBox>
        {showCustomOption && (
          <ListBox.Item onAction={() => onCustomValueSubmit(text)}>
            Add "{text}" as new customer
          </ListBox.Item>
        )}
        {options.map((opt) => (
          <ListBox.Item key={opt.key}>{opt.label}</ListBox.Item>
        ))}
      </ListBox>
    </ComboBox.Popover>
  </ComboBox>
  ```

---

### 2.2 `AppAutocomplete` (Select Trigger + Popover Search)
- **When to choose:**
  - Choose `AppAutocomplete` when users must strictly pick from a predefined, bounded list (e.g. currency selector, account picker, branch/outlet selector).
  - When the trigger should display rich selected states (e.g. account badge, currency symbol, status pill).
  - When a dedicated clear button (`Autocomplete.ClearButton`) is desired to reset the field.
- **Anatomy in HeroUI v3:**
  ```tsx
  <Autocomplete ...>
    <Label>{label}</Label>
    <Autocomplete.Trigger>
      <Autocomplete.Value />
      <Autocomplete.ClearButton />
      <Autocomplete.Indicator />
    </Autocomplete.Trigger>
    <Autocomplete.Popover>
      <Autocomplete.Filter>
        <SearchField />
      </Autocomplete.Filter>
      <ListBox>
        {options.map((opt) => (
          <ListBox.Item key={opt.key}>{opt.label}</ListBox.Item>
        ))}
      </ListBox>
    </Autocomplete.Popover>
  </Autocomplete>
  ```

---

### 2.3 `AppPickerSheet` (Professions / Category Bottom Sheet)
- **When to choose:**
  - Choose `AppPickerSheet` for mobile-first selection of complex, category-heavy datasets (inspired by HeroUI's Professions Picker).
  - When items have rich metadata (badges, icons, subtext, categories) that would feel cramped inside a standard dropdown popover.
  - Ideal for Expense Categories, Revenue Categories, and Chart of Accounts.
- **Anatomy in HeroUI v3:**
  ```tsx
  <Sheet.Root isOpen={isOpen} onOpenChange={onOpenChange}>
    <Sheet.Backdrop />
    <Sheet.Content>
      <Sheet.Dialog>
        <Sheet.Handle />
        <Sheet.Header>
          <Sheet.Heading>{title}</Sheet.Heading>
        </Sheet.Header>
        <Sheet.Body>
          {/* Search Bar + Category Pills + Categorized Cards Grid */}
        </Sheet.Body>
      </Sheet.Dialog>
    </Sheet.Content>
  </Sheet.Root>
  ```
