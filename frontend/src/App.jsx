import { useEffect, useMemo, useState } from 'react'
import './App.css'
import ImageEnhancer from './ImageEnhancer'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000/api'

const initialForm = {
  name: '',
  email: '',
  department: '',
  role: '',
  hireDate: '',
}

function App() {
  const [employees, setEmployees] = useState([])
  const [departmentFilter, setDepartmentFilter] = useState('')
  const [form, setForm] = useState(initialForm)
  const [editingId, setEditingId] = useState(null)
  const [error, setError] = useState('')

  const departments = useMemo(
    () => [...new Set(employees.map((employee) => employee.department))].sort(),
    [employees],
  )

  const loadEmployees = async (department = '') => {
    try {
      const query = department ? `?department=${encodeURIComponent(department)}` : ''
      const response = await fetch(`${API_BASE}/employees${query}`)
      if (!response.ok) throw new Error('Failed to load employees')
      const data = await response.json()
      setEmployees(data)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  useEffect(() => {
    loadEmployees(departmentFilter)
  }, [departmentFilter])

  const handleInputChange = (event) => {
    const { name, value } = event.target
    setForm((current) => ({ ...current, [name]: value }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')

    const endpoint = editingId ? `${API_BASE}/employees/${editingId}` : `${API_BASE}/employees`
    const method = editingId ? 'PUT' : 'POST'

    try {
      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })

      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: 'Request failed' }))
        throw new Error(body.error || 'Request failed')
      }

      setForm(initialForm)
      setEditingId(null)
      loadEmployees(departmentFilter)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const handleEdit = (employee) => {
    setEditingId(employee.id)
    setForm({
      name: employee.name,
      email: employee.email,
      department: employee.department,
      role: employee.role,
      hireDate: employee.hireDate,
    })
  }

  const handleDelete = async (id) => {
    setError('')

    try {
      const response = await fetch(`${API_BASE}/employees/${id}`, { method: 'DELETE' })
      if (!response.ok) {
        const body = await response.json().catch(() => ({ error: 'Delete failed' }))
        throw new Error(body.error || 'Delete failed')
      }

      if (editingId === id) {
        setEditingId(null)
        setForm(initialForm)
      }

      loadEmployees(departmentFilter)
    } catch (requestError) {
      setError(requestError.message)
    }
  }

  const resetForm = () => {
    setEditingId(null)
    setForm(initialForm)
  }

  return (
    <main className="container">
      <h1>Employee Management System</h1>

      {error && <p className="error">{error}</p>}

      <ImageEnhancer />

      <section className="panel">
        <h2>{editingId ? `Edit Employee #${editingId}` : 'Add Employee'}</h2>
        <form className="form-grid" onSubmit={handleSubmit}>
          <input name="name" placeholder="Name" value={form.name} onChange={handleInputChange} required />
          <input name="email" type="email" placeholder="Email" value={form.email} onChange={handleInputChange} required />
          <input name="department" placeholder="Department" value={form.department} onChange={handleInputChange} required />
          <input name="role" placeholder="Role" value={form.role} onChange={handleInputChange} required />
          <input name="hireDate" type="date" value={form.hireDate} onChange={handleInputChange} required />
          <div className="form-actions">
            <button type="submit">{editingId ? 'Update Employee' : 'Add Employee'}</button>
            {editingId && (
              <button type="button" className="secondary" onClick={resetForm}>
                Cancel
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="panel">
        <div className="toolbar">
          <h2>Employees</h2>
          <label>
            Department
            <select value={departmentFilter} onChange={(event) => setDepartmentFilter(event.target.value)}>
              <option value="">All</option>
              {departments.map((department) => (
                <option key={department} value={department}>
                  {department}
                </option>
              ))}
            </select>
          </label>
        </div>

        {employees.length === 0 ? (
          <p>No employees found.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Name</th>
                <th>Email</th>
                <th>Department</th>
                <th>Role</th>
                <th>Hire Date</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {employees.map((employee) => (
                <tr key={employee.id}>
                  <td>{employee.id}</td>
                  <td>{employee.name}</td>
                  <td>{employee.email}</td>
                  <td>{employee.department}</td>
                  <td>{employee.role}</td>
                  <td>{employee.hireDate}</td>
                  <td className="actions">
                    <button type="button" onClick={() => handleEdit(employee)}>
                      Edit
                    </button>
                    <button type="button" className="danger" onClick={() => handleDelete(employee.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  )
}

export default App
